import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import MockAdapter from 'axios-mock-adapter'
import type { ReactNode } from 'react'
import { api } from '@/lib/api'
import { useReadingProgress } from './use-reading-progress'

let mock: MockAdapter

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  mock = new MockAdapter(api)
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  mock.restore()
  vi.useRealTimers()
})

describe('useReadingProgress', () => {
  it('loads progress via GET /progress/:fileId on mount', async () => {
    mock.onGet('/progress/file-1').reply(200, {
      fileId: 'file-1',
      currentPage: 4,
      totalPages: 20,
      readingMode: 'paginated',
    })

    const { result } = renderHook(() => useReadingProgress('file-1'), { wrapper })
    await waitFor(() => expect(result.current.progress?.currentPage).toBe(4))
  })

  it('debounces saves: one PUT after 2s of quiet', async () => {
    mock.onGet('/progress/f').reply(200, {
      fileId: 'f',
      currentPage: 0,
      totalPages: 10,
      readingMode: 'paginated',
    })
    const puts: Array<unknown> = []
    mock.onPut('/progress/f').reply((cfg) => {
      puts.push(JSON.parse(cfg.data))
      return [200, { fileId: 'f', ...JSON.parse(cfg.data) }]
    })

    const { result } = renderHook(() => useReadingProgress('f'), { wrapper })
    await waitFor(() => expect(result.current.progress).toBeDefined())

    act(() => {
      result.current.save({ currentPage: 1, totalPages: 10, readingMode: 'paginated' })
      result.current.save({ currentPage: 2, totalPages: 10, readingMode: 'paginated' })
      result.current.save({ currentPage: 3, totalPages: 10, readingMode: 'paginated' })
    })
    expect(puts.length).toBe(0)

    await act(async () => {
      vi.advanceTimersByTime(2000)
    })
    await waitFor(() => expect(puts.length).toBe(1))
    expect(puts[0]).toMatchObject({ currentPage: 3 })
  })

  it('flushes the pending save on unmount', async () => {
    mock.onGet('/progress/f2').reply(200, {
      fileId: 'f2',
      currentPage: 0,
      totalPages: 5,
      readingMode: 'paginated',
    })
    let putCalled = 0
    mock.onPut('/progress/f2').reply(() => {
      putCalled += 1
      return [200, {}]
    })

    const { result, unmount } = renderHook(() => useReadingProgress('f2'), { wrapper })
    await waitFor(() => expect(result.current.progress).toBeDefined())

    act(() => {
      result.current.save({ currentPage: 2, totalPages: 5, readingMode: 'paginated' })
    })
    // Unmount before the 2s timer elapses; flush should fire the pending save.
    unmount()
    await waitFor(() => expect(putCalled).toBe(1))
  })
})
