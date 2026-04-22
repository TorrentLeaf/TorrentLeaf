import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useAuthStore } from '@/store/auth'
import { pageStreamURL } from './reader'

describe('pageStreamURL', () => {
  const ORIGINAL_API = process.env.NEXT_PUBLIC_API_URL
  beforeEach(() => {
    useAuthStore.getState().clear()
  })
  afterEach(() => {
    process.env.NEXT_PUBLIC_API_URL = ORIGINAL_API
    vi.unstubAllEnvs()
  })

  it('builds the whole-file URL with encoded token', () => {
    useAuthStore.getState().setTokens('tok/1 2', 'r')
    const url = pageStreamURL('abc')
    expect(url).toMatch(/\/api\/v1\/stream\/abc\?token=tok%2F1%202$/)
  })

  it('includes entryIndex segment for CBZ entries', () => {
    useAuthStore.getState().setTokens('tok', 'r')
    const url = pageStreamURL('file-1', 5)
    expect(url).toMatch(/\/api\/v1\/stream\/file-1\/5\?token=tok$/)
  })

  it('still emits token= even when no auth token is present', () => {
    const url = pageStreamURL('f')
    expect(url).toContain('token=')
  })
})
