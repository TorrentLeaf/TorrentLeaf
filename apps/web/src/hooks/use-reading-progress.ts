'use client'

import { useEffect, useMemo } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { debounce } from '@/lib/debounce'
import type { ReadingMode, ReadingProgress } from '@/lib/reader'

interface SavePayload {
  currentPage: number
  totalPages?: number
  readingMode?: ReadingMode
}

/**
 * useReadingProgress loads the server-side progress for `fileId` and returns
 * a debounced `save` function. The trailing save is flushed on unmount so
 * the user never loses the last page they read when closing the tab.
 */
export function useReadingProgress(fileId: string) {
  const query = useQuery<ReadingProgress>({
    queryKey: ['progress', fileId],
    queryFn: async () => {
      const { data } = await api.get<ReadingProgress>(`/progress/${fileId}`)
      return data
    },
    staleTime: 30_000,
  })

  const mutation = useMutation({
    mutationFn: async (payload: SavePayload) => {
      const { data } = await api.put<ReadingProgress>(
        `/progress/${fileId}`,
        payload,
      )
      return data
    },
  })

  const debouncedSave = useMemo(
    () => debounce((payload: SavePayload) => mutation.mutate(payload), 2000),
    [mutation],
  )

  useEffect(() => {
    return () => {
      debouncedSave.flush()
    }
  }, [debouncedSave])

  return {
    progress: query.data,
    isLoading: query.isLoading,
    save: debouncedSave,
  }
}
