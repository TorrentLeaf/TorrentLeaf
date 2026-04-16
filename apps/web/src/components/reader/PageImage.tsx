'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

export interface PageImageProps {
  src: string
  page: number
  priority?: boolean
  onLoad?: () => void
}

/**
 * PageImage renders a single manga page while reserving space for its aspect
 * ratio as soon as the image's natural dimensions are known. Before that, a
 * tall placeholder keeps the webtoon column from collapsing and jumping.
 */
export function PageImage({ src, page, priority = false, onLoad }: PageImageProps) {
  const [ratio, setRatio] = useState<number | null>(null)
  const [loaded, setLoaded] = useState(false)

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
      {!loaded && (
        <div className="absolute inset-0 animate-pulse bg-[hsl(var(--surface-2))]" />
      )}
      <img
        src={src}
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
          onLoad?.()
        }}
      />
    </div>
  )
}
