'use client'

import { useEffect, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { pageStreamURL, type ReaderPage } from '@/lib/reader'

/**
 * useMangaPreload warms the browser image cache for the pages neighbouring
 * the current one (3 ahead, 1 behind). The real <img> rendered later picks
 * the image up from disk cache instantly.
 *
 * TanStack's queryClient is used for de-duplication; the actual fetch is an
 * offscreen `Image()` so the bytes stay in browser cache rather than the JS
 * heap.
 */
export function useMangaPreload(pages: ReaderPage[], currentPage: number) {
  const queryClient = useQueryClient()

  const targets = useMemo(() => {
    const indexes = [
      currentPage + 1,
      currentPage + 2,
      currentPage + 3,
      currentPage - 1,
    ].filter((i) => i >= 0 && i < pages.length)
    return indexes.map((i) => pages[i])
  }, [pages, currentPage])

  useEffect(() => {
    targets.forEach((page) => {
      queryClient.prefetchQuery({
        queryKey: ['page-preload', page.fileId],
        staleTime: 10 * 60 * 1000,
        queryFn: () =>
          new Promise<true>((resolve, reject) => {
            const img = new Image()
            img.onload = () => resolve(true)
            img.onerror = () => reject(new Error('preload failed'))
            img.src = pageStreamURL(page.fileId)
          }),
      })
    })
  }, [targets, queryClient])
}
