export interface DebouncedFn<A extends unknown[]> {
  (...args: A): void
  flush: () => void
  cancel: () => void
}

/**
 * debounce returns a function that delays invocation until `wait` ms have
 * elapsed since the last call. `flush` invokes the pending call immediately
 * (used on unmount so reading progress is not lost).
 */
export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  wait: number,
): DebouncedFn<A> {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: A | null = null

  const debounced = ((...args: A) => {
    pending = args
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      const a = pending
      pending = null
      if (a) fn(...a)
    }, wait)
  }) as DebouncedFn<A>

  debounced.flush = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    const a = pending
    pending = null
    if (a) fn(...a)
  }

  debounced.cancel = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    pending = null
  }

  return debounced
}
