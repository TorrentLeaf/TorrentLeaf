import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useAuthStore } from '@/store/auth'
import { pageStreamURL, videoStreamURL, hlsPlaylistURL, subtitleURL } from './reader'

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

describe('video / hls / subtitle URLs', () => {
  beforeEach(() => useAuthStore.getState().setTokens('tok', 'r'))
  afterEach(() => useAuthStore.getState().clear())

  it('videoStreamURL without and with audio track', () => {
    expect(videoStreamURL('v')).toMatch(/\/api\/v1\/stream\/v\?token=tok$/)
    expect(videoStreamURL('v', 3)).toMatch(/audio=3/)
  })
  it('hlsPlaylistURL without and with audio track', () => {
    expect(hlsPlaylistURL('v')).toMatch(/\/api\/v1\/hls\/v\/playlist\.m3u8\?token=tok$/)
    expect(hlsPlaylistURL('v', 2)).toMatch(/audio=2/)
  })
  it('subtitleURL targets the stream index', () => {
    expect(subtitleURL('v', 4)).toMatch(/\/api\/v1\/subtitles\/v\/4\?token=tok$/)
  })
})
