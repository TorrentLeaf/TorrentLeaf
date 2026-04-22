import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import MockAdapter from 'axios-mock-adapter'
import axios from 'axios'
import { api } from './api'
import { useAuthStore } from '@/store/auth'

let mock: MockAdapter
let topLevelMock: MockAdapter

beforeEach(() => {
  mock = new MockAdapter(api)
  topLevelMock = new MockAdapter(axios)
  useAuthStore.getState().clear()
})

afterEach(() => {
  mock.restore()
  topLevelMock.restore()
  vi.restoreAllMocks()
})

describe('api request interceptor', () => {
  it('attaches Authorization when an access token is set', async () => {
    useAuthStore.getState().setTokens('access-token', 'refresh-token')
    mock.onGet('/ping').reply((config) => {
      expect(config.headers?.Authorization).toBe('Bearer access-token')
      return [200, { ok: true }]
    })
    const resp = await api.get('/ping')
    expect(resp.status).toBe(200)
  })

  it('omits Authorization when no token is present', async () => {
    mock.onGet('/public').reply((config) => {
      expect(config.headers?.Authorization).toBeUndefined()
      return [200, { ok: true }]
    })
    await api.get('/public')
  })
})

describe('api response interceptor', () => {
  it('retries once after 401 using a fresh access token', async () => {
    useAuthStore.getState().setTokens('stale', 'refresh-val')

    let calls = 0
    mock.onGet('/me').reply(() => {
      calls += 1
      if (calls === 1) return [401, { error: 'expired' }]
      return [200, { id: 'u1' }]
    })
    topLevelMock.onPost(/\/auth\/refresh$/).reply(200, { accessToken: 'new-token' })

    const resp = await api.get('/me')
    expect(resp.status).toBe(200)
    expect(calls).toBe(2)
    expect(useAuthStore.getState().accessToken).toBe('new-token')
  })

  it('clears auth state and rejects when refresh fails', async () => {
    useAuthStore.getState().setTokens('stale', 'bad-refresh')
    mock.onGet('/me').reply(401, { error: 'expired' })
    topLevelMock.onPost(/\/auth\/refresh$/).reply(500)

    await expect(api.get('/me')).rejects.toThrow()
    expect(useAuthStore.getState().accessToken).toBeNull()
    expect(useAuthStore.getState().refreshToken).toBeNull()
  })

  it('does not attempt refresh when there is no refresh token', async () => {
    mock.onGet('/me').reply(401, { error: 'unauth' })
    const refreshSpy = vi.fn()
    topLevelMock.onPost(/\/auth\/refresh$/).reply((cfg) => {
      refreshSpy(cfg)
      return [200, { accessToken: 'n' }]
    })

    await expect(api.get('/me')).rejects.toThrow()
    expect(refreshSpy).not.toHaveBeenCalled()
  })

  it('passes through non-401 errors without retry', async () => {
    useAuthStore.getState().setTokens('t', 'r')
    let calls = 0
    mock.onGet('/boom').reply(() => {
      calls += 1
      return [500, { error: 'server' }]
    })
    await expect(api.get('/boom')).rejects.toThrow()
    expect(calls).toBe(1)
  })

  it('does not retry a request that was already retried once', async () => {
    useAuthStore.getState().setTokens('stale', 'refresh-val')

    let calls = 0
    mock.onGet('/loop').reply(() => {
      calls += 1
      return [401, {}]
    })
    topLevelMock.onPost(/\/auth\/refresh$/).reply(200, { accessToken: 'new-token' })

    await expect(api.get('/loop')).rejects.toThrow()
    expect(calls).toBe(2)
  })
})
