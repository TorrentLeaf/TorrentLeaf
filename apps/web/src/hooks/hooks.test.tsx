import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useViewport } from './use-viewport'
import { useReducedMotion } from './use-reduced-motion'
import { useToast, toast } from './use-toast'
import { useTorrentProgress } from './use-torrent-progress'
import { useAuthStore } from '@/store/auth'

describe('useViewport', () => {
  afterEach(() => {
    ;(window as unknown as { innerWidth: number }).innerWidth = 1024
  })
  it('classifies mobile/tablet/desktop and reacts to resize', () => {
    ;(window as unknown as { innerWidth: number }).innerWidth = 500
    const { result } = renderHook(() => useViewport())
    expect(result.current.isMobile).toBe(true)

    act(() => {
      ;(window as unknown as { innerWidth: number }).innerWidth = 900
      window.dispatchEvent(new Event('resize'))
    })
    expect(result.current.isTablet).toBe(true)
    expect(result.current.isMobile).toBe(false)

    act(() => {
      ;(window as unknown as { innerWidth: number }).innerWidth = 1400
      window.dispatchEvent(new Event('resize'))
    })
    expect(result.current.isMobile).toBe(false)
    expect(result.current.isTablet).toBe(false)
  })
})

describe('useReducedMotion', () => {
  const original = window.matchMedia
  afterEach(() => {
    window.matchMedia = original
  })
  it('returns true when the media query matches', () => {
    window.matchMedia = ((q: string) => ({
      matches: true,
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia
    const { result } = renderHook(() => useReducedMotion())
    expect(result.current).toBe(true)
  })
  it('returns false when it does not match (default stub)', () => {
    const { result } = renderHook(() => useReducedMotion())
    expect(result.current).toBe(false)
  })
})

describe('useToast', () => {
  it('adds, updates, and dismisses a toast', () => {
    const { result } = renderHook(() => useToast())
    let handle: ReturnType<typeof toast>
    act(() => {
      handle = toast({ title: 'Hello' })
    })
    expect(result.current.toasts.some((t) => t.title === 'Hello')).toBe(true)

    act(() => handle.update({ id: handle.id, title: 'Updated' }))
    expect(result.current.toasts.find((t) => t.id === handle.id)?.title).toBe('Updated')

    act(() => handle.dismiss())
    expect(result.current.toasts.find((t) => t.id === handle.id)?.open).toBe(false)
  })
})

// A minimal WebSocket stand-in so the hook can be exercised without a server.
class FakeWS {
  static last: FakeWS | null = null
  onopen: (() => void) | null = null
  onerror: (() => void) | null = null
  onclose: (() => void) | null = null
  onmessage: ((ev: { data: string }) => void) | null = null
  closed = false
  constructor(public url: string) {
    FakeWS.last = this
  }
  close() {
    this.closed = true
  }
}

describe('useTorrentProgress', () => {
  beforeEach(() => {
    ;(globalThis as unknown as { WebSocket: unknown }).WebSocket = FakeWS
    useAuthStore.getState().setTokens('tok', 'r')
  })
  afterEach(() => {
    useAuthStore.getState().clear()
    vi.restoreAllMocks()
  })

  it('stays idle without a torrent id or token', () => {
    const { result } = renderHook(() => useTorrentProgress(null))
    expect(result.current.status).toBe('connecting')
    expect(FakeWS.last).toBeNull()
  })

  it('opens a socket and applies progress frames', async () => {
    FakeWS.last = null
    const { result } = renderHook(() => useTorrentProgress('t1'))
    const ws = FakeWS.last!
    expect(ws.url).toContain('/api/v1/torrents/t1/ws?token=tok')

    act(() => ws.onopen?.())
    await waitFor(() => expect(result.current.status).toBe('open'))

    act(() => ws.onmessage?.({ data: JSON.stringify({ infoHash: 'h', progress: 0.5, downloadSpeed: 1, uploadSpeed: 2, peers: 3 }) }))
    expect(result.current.progress?.progress).toBe(0.5)

    // malformed + non-progress frames are ignored
    act(() => ws.onmessage?.({ data: 'not json' }))
    act(() => ws.onmessage?.({ data: JSON.stringify({ type: 'ping' }) }))
    expect(result.current.progress?.progress).toBe(0.5)

    act(() => ws.onerror?.())
    await waitFor(() => expect(result.current.status).toBe('error'))
  })
})
