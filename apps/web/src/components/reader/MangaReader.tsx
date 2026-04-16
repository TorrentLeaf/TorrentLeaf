'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Maximize, Minimize, Rows3, BookOpen } from 'lucide-react'

import { api } from '@/lib/api'
import { pageStreamURL, type ReaderPage, type ReadingMode } from '@/lib/reader'
import { Button } from '@/components/ui/button'
import { useMangaPreload } from '@/hooks/use-manga-preload'
import { useReadingProgress } from '@/hooks/use-reading-progress'
import { useReaderKeyboard } from '@/hooks/use-reader-keyboard'
import { PageImage } from './PageImage'

export interface MangaReaderProps {
  sessionId: string
}

const MODE_ORDER: ReadingMode[] = ['paginated', 'webtoon', 'double-page']

export function MangaReader({ sessionId }: MangaReaderProps) {
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)
  const webtoonRef = useRef<HTMLDivElement>(null)

  const pagesQuery = useQuery<ReaderPage[]>({
    queryKey: ['reader-pages', sessionId],
    queryFn: async () => {
      const { data } = await api.get<ReaderPage[]>(`/reader/${sessionId}/pages`)
      return data
    },
  })
  const pages = pagesQuery.data ?? []
  const totalPages = pages.length

  const firstFileId = pages[0]?.fileId ?? ''
  const { progress, save } = useReadingProgress(firstFileId || 'pending')

  const [currentPage, setCurrentPage] = useState(0)
  const [mode, setMode] = useState<ReadingMode>('paginated')
  const [restored, setRestored] = useState(false)

  useEffect(() => {
    if (!restored && progress && totalPages > 0) {
      if (progress.currentPage > 0 && progress.currentPage < totalPages) {
        setCurrentPage(progress.currentPage)
      }
      if (progress.readingMode) setMode(progress.readingMode)
      setRestored(true)
    }
  }, [progress, restored, totalPages])

  useMangaPreload(pages, currentPage)

  const persist = useCallback(
    (page: number, nextMode: ReadingMode = mode) => {
      if (!firstFileId || totalPages === 0) return
      save({ currentPage: page, totalPages, readingMode: nextMode })
    },
    [save, firstFileId, totalPages, mode],
  )

  const goToNext = useCallback(() => {
    setCurrentPage((p) => {
      const next = Math.min(p + 1, totalPages - 1)
      if (next !== p) persist(next)
      return next
    })
  }, [totalPages, persist])

  const goToPrev = useCallback(() => {
    setCurrentPage((p) => {
      const next = Math.max(p - 1, 0)
      if (next !== p) persist(next)
      return next
    })
  }, [persist])

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
    } else {
      el.requestFullscreen().catch(() => {})
    }
  }, [])

  const cycleMode = useCallback(() => {
    setMode((m) => {
      const next = MODE_ORDER[(MODE_ORDER.indexOf(m) + 1) % MODE_ORDER.length]
      persist(currentPage, next)
      return next
    })
  }, [currentPage, persist])

  const escape = useCallback(() => router.back(), [router])

  useReaderKeyboard({
    onNext: goToNext,
    onPrev: goToPrev,
    onToggleFullscreen: toggleFullscreen,
    onCycleMode: cycleMode,
    onEscape: escape,
  })

  // Webtoon: detect current page from scroll via IntersectionObserver.
  useEffect(() => {
    if (mode !== 'webtoon' || !webtoonRef.current) return
    const root = webtoonRef.current
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (visible) {
          const page = parseInt(
            visible.target.getAttribute('data-page') ?? '0',
            10,
          )
          setCurrentPage((prev) => {
            if (prev !== page) persist(page)
            return page
          })
        }
      },
      { threshold: [0.3, 0.5, 0.7] },
    )
    root.querySelectorAll('[data-page]').forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [mode, pages, persist])

  const [isFullscreen, setIsFullscreen] = useState(false)
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const modeLabel = useMemo(() => {
    if (mode === 'paginated') return 'Paginated'
    if (mode === 'webtoon') return 'Webtoon'
    return 'Double page'
  }, [mode])

  if (pagesQuery.isLoading) {
    return <ReaderLoading />
  }

  if (pagesQuery.isError || totalPages === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[hsl(var(--background))] text-[hsl(var(--muted))]">
        <p className="text-sm">No readable pages found in this torrent.</p>
      </div>
    )
  }

  const currentPageData = pages[currentPage]

  return (
    <div
      ref={containerRef}
      className="flex min-h-screen flex-col bg-[hsl(var(--background))] text-[hsl(var(--foreground))]"
    >
      <header className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]/80 px-4 py-2 backdrop-blur">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={escape}
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <span className="truncate text-sm text-[hsl(var(--muted))]">
            {currentPageData?.name}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-[hsl(var(--muted))]">
          <span>
            {currentPage + 1} / {totalPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={cycleMode}
            aria-label="Cycle reading mode"
            title="Cycle reading mode (M)"
          >
            {mode === 'webtoon' ? (
              <Rows3 className="mr-1 h-4 w-4" />
            ) : (
              <BookOpen className="mr-1 h-4 w-4" />
            )}
            {modeLabel}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleFullscreen}
            aria-label="Toggle fullscreen"
            title="Fullscreen (F)"
          >
            {isFullscreen ? (
              <Minimize className="h-4 w-4" />
            ) : (
              <Maximize className="h-4 w-4" />
            )}
          </Button>
        </div>
      </header>

      <main className="flex-1">
        {mode === 'webtoon' ? (
          <div ref={webtoonRef} className="mx-auto max-w-3xl">
            {pages.map((p, i) => (
              <PageImage
                key={p.fileId}
                src={pageStreamURL(p.fileId)}
                page={i}
                priority={i === currentPage}
              />
            ))}
          </div>
        ) : mode === 'double-page' ? (
          <PaginatedCanvas
            pages={pages}
            currentPage={currentPage}
            onNext={goToNext}
            onPrev={goToPrev}
            double
          />
        ) : (
          <PaginatedCanvas
            pages={pages}
            currentPage={currentPage}
            onNext={goToNext}
            onPrev={goToPrev}
          />
        )}
      </main>

      <footer className="sticky bottom-0 z-20 border-t border-[hsl(var(--border))] bg-[hsl(var(--background))]/80 px-4 py-2 backdrop-blur">
        <input
          type="range"
          min={0}
          max={Math.max(0, totalPages - 1)}
          value={currentPage}
          aria-label="Page"
          onChange={(e) => {
            const p = Number(e.target.value)
            setCurrentPage(p)
            persist(p)
          }}
          className="w-full accent-[hsl(var(--accent))]"
        />
      </footer>
    </div>
  )
}

interface PaginatedCanvasProps {
  pages: ReaderPage[]
  currentPage: number
  onNext: () => void
  onPrev: () => void
  double?: boolean
}

function PaginatedCanvas({
  pages,
  currentPage,
  onNext,
  onPrev,
  double,
}: PaginatedCanvasProps) {
  const left = double && currentPage > 0 ? pages[currentPage - 1] : null
  const current = pages[currentPage]

  return (
    <div className="relative mx-auto flex min-h-[calc(100vh-6rem)] max-w-6xl items-center justify-center">
      <button
        type="button"
        aria-label="Previous page"
        onClick={onPrev}
        className="absolute inset-y-0 left-0 z-10 w-1/3 cursor-pointer bg-transparent"
      />
      <button
        type="button"
        aria-label="Next page"
        onClick={onNext}
        className="absolute inset-y-0 right-0 z-10 w-1/3 cursor-pointer bg-transparent"
      />

      <div className="flex h-full w-full items-center justify-center gap-2 p-2">
        {double && left && (
          <div className="max-h-[calc(100vh-6rem)] w-1/2">
            <PageImage
              src={pageStreamURL(left.fileId)}
              page={currentPage - 1}
              priority
            />
          </div>
        )}
        {current && (
          <div
            className={
              double && left ? 'max-h-[calc(100vh-6rem)] w-1/2' : 'max-h-[calc(100vh-6rem)] w-full max-w-3xl'
            }
          >
            <PageImage
              src={pageStreamURL(current.fileId)}
              page={currentPage}
              priority
            />
          </div>
        )}
      </div>
    </div>
  )
}

function ReaderLoading() {
  return (
    <div className="min-h-screen bg-[hsl(var(--background))] p-4">
      <div className="mx-auto grid max-w-3xl gap-2">
        {[60, 80, 55].map((h, i) => (
          <div
            key={i}
            className="w-full animate-pulse rounded-sm bg-[hsl(var(--surface-2))]"
            style={{ height: `${h}vh` }}
          />
        ))}
      </div>
    </div>
  )
}
