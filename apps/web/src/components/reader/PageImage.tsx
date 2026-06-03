'use client'

import { useCallback, useRef, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface PageImageProps {
  src: string
  page: number
  priority?: boolean
  onLoad?: () => void
}

const MAX_AUTO_RETRIES = 8
const RETRY_DELAY_MS = 3000

/**
 * PageImage renders a single manga page while reserving space for its aspect
 * ratio as soon as the image's natural dimensions are known. Before that, a
 * tall placeholder keeps the webtoon column from collapsing and jumping.
 *
 * When the image fails to load (e.g. 503 from the engine because the torrent
 * is still downloading), it automatically retries up to MAX_AUTO_RETRIES times
 * with a 3-second delay, then shows a manual "Retry" button.
 */
export function PageImage({ src, page, priority = false, onLoad }: PageImageProps) {
  const [ratio, setRatio] = useState<number | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)
  const [retries, setRetries] = useState(0)
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const retry = useCallback(() => {
    setError(false)
    setLoaded(false)
    // Force browser to re-fetch by appending a cache-buster
    setRetries((r) => r + 1)
  }, [])

  const handleError = useCallback(() => {
    if (retries < MAX_AUTO_RETRIES) {
      // Auto-retry after a delay
      retryTimer.current = setTimeout(() => {
        retry()
      }, RETRY_DELAY_MS)
    } else {
      setError(true)
    }
  }, [retries, retry])

  const imgSrc = retries > 0 ? `${src}&_retry=${retries}` : src

  return (
    <div
      data-page={page}
      className="relative w-full bg-[hsl(var(--surface-2))]"
      style={
        ratio
          ? { paddingBottom: `${ratio * 100}%` }
          : { minHeight: '60vh' }
      }
    >
      {/* Loading shimmer */}
      {!loaded && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-[hsl(var(--surface-2))]">
          <Loader2 className="h-6 w-6 animate-spin text-white/20" />
        </div>
      )}

      {/* Error state with manual retry */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[hsl(var(--surface-2))]">
          <p className="text-sm text-white/40">
            Page {page + 1} is still downloading…
          </p>
          <button
            onClick={retry}
            className="flex items-center gap-1.5 rounded-md bg-white/10 px-3 py-1.5 text-sm text-white/60 hover:bg-white/20 hover:text-white transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </button>
        </div>
      )}

      <img
        src={imgSrc}
        alt={`Page ${page + 1}`}
        decoding="async"
        loading={priority ? 'eager' : 'lazy'}
        draggable={false}
        className={cn(
          'absolute inset-0 h-full w-full object-contain transition-opacity duration-200',
          loaded ? 'opacity-100' : 'opacity-0',
        )}
        onLoad={(e) => {
          const img = e.currentTarget
          if (img.naturalWidth > 0) {
            setRatio(img.naturalHeight / img.naturalWidth)
          }
          setLoaded(true)
          setError(false)
          onLoad?.()
        }}
        onError={handleError}
      />
    </div>
  )
}
