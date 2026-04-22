import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { debounce } from './debounce'

describe('debounce', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('delays the call until wait has elapsed without new invocations', () => {
    const fn = vi.fn()
    const d = debounce(fn, 100)

    d(1)
    d(2)
    d(3)
    vi.advanceTimersByTime(99)
    expect(fn).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith(3)
  })

  it('flush invokes the pending call immediately', () => {
    const fn = vi.fn()
    const d = debounce(fn, 500)
    d('pending')
    d.flush()
    expect(fn).toHaveBeenCalledWith('pending')
  })

  it('flush is a no-op when nothing is pending', () => {
    const fn = vi.fn()
    const d = debounce(fn, 500)
    d.flush()
    expect(fn).not.toHaveBeenCalled()
  })

  it('cancel drops the pending call', () => {
    const fn = vi.fn()
    const d = debounce(fn, 200)
    d('x')
    d.cancel()
    vi.advanceTimersByTime(500)
    expect(fn).not.toHaveBeenCalled()
  })
})
