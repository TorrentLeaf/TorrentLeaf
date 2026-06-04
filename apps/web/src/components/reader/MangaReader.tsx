'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Minus, Plus, Sun } from 'lucide-react'

import { api } from '@/lib/api'
import { pageStreamURL, type ReaderPage, type ReadingMode } from '@/lib/reader'
import { useMangaPreload } from '@/hooks/use-manga-preload'
import { useReadingProgress } from '@/hooks/use-reading-progress'
import { useUserSettings } from '@/hooks/use-user-settings'
import { PageImage } from './PageImage'
import {
  ReaderShell,
  type FitMode,
  type Direction,
} from './ReaderShell'

export interface MangaReaderProps {
  sessionId: string
  /** Filter the reader to a single file (CBZ chapter). */
  fileId?: string
  /** Load every page in the session, then seek to the page belonging to
   *  this file. Used for loose-image torrents where each file is one page. */
  startFile?: string
}

export function MangaReader({ sessionId, fileId, startFile }: MangaReaderProps) {
  const webtoonRef = useRef<HTMLDivElement>(null)

  // ── Data ──────────────────────────────────────────────
  const pagesQuery = useQuery<ReaderPage[]>({
    queryKey: ['reader-pages', sessionId, fileId ?? null],
    queryFn: async () => {
      const url = fileId
        ? `/reader/${sessionId}/pages?fileId=${encodeURIComponent(fileId)}`
        : `/reader/${sessionId}/pages`
      const { data } = await api.get<ReaderPage[]>(url)
      return data
    },
    retry: (failureCount, err) => {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 503) return failureCount < 20
      return failureCount < 2
    },
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  })
  const pages = pagesQuery.data ?? []
  const totalPages = pages.length
  const firstFileId = pages[0]?.fileId ?? ''

  const { progress, save } = useReadingProgress(firstFileId || 'pending')

  const { settings } = useUserSettings()

  // ── State (initialized from user settings) ────────────
  const [currentPage, setCurrentPage] = useState(0)
  const [mode, setMode] = useState<ReadingMode>(settings.defaultReadingMode as ReadingMode)
  const [fitMode, setFitMode] = useState<FitMode>(settings.defaultFitMode as FitMode)
  const [direction, setDirection] = useState<Direction>(settings.readingDirection as Direction)
  const [background, setBackground] = useState(settings.readerBackground || '#000000')
  const [zoom, setZoom] = useState(150) // % — larger default for comfortable reading
  const [brightness, setBrightness] = useState(100) // %
  const [restored, setRestored] = useState(false)

  // Restore progress (or, if the user opened via a per-file deep link,
  // seek to that file instead — explicit navigation wins over history).
  useEffect(() => {
    if (restored || totalPages === 0) return
    if (startFile) {
      const target = pages.findIndex((p) => p.fileId === startFile)
      if (target >= 0) {
        setCurrentPage(target)
        setRestored(true)
        return
      }
    }
    if (progress) {
      if (progress.currentPage > 0 && progress.currentPage < totalPages) {
        setCurrentPage(progress.currentPage)
      }
      if (progress.readingMode) setMode(progress.readingMode)
      setRestored(true)
    }
  }, [progress, restored, totalPages, startFile, pages])

  useMangaPreload(pages, currentPage)

  // ── Persistence ───────────────────────────────────────
  const persist = useCallback(
    (page: number, nextMode: ReadingMode = mode) => {
      if (!firstFileId || totalPages === 0) return
      save({ currentPage: page, totalPages, readingMode: nextMode })
    },
    [save, firstFileId, totalPages, mode],
  )

  // ── Navigation ────────────────────────────────────────
  const step = mode === 'double-page' ? 2 : 1

  const goToNext = useCallback(() => {
    setCurrentPage((p) => {
      const next = Math.min(p + step, totalPages - 1)
      if (next !== p) persist(next)
      return next
    })
  }, [totalPages, persist, step])

  const goToPrev = useCallback(() => {
    setCurrentPage((p) => {
      const next = Math.max(p - step, 0)
      if (next !== p) persist(next)
      return next
    })
  }, [persist, step])

  // ── Webtoon scroll-tracking ───────────────────────────
  useEffect(() => {
    if (mode !== 'webtoon' || !webtoonRef.current) return
    const root = webtoonRef.current
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (visible) {
          const page = parseInt(visible.target.getAttribute('data-page') ?? '0', 10)
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

  // ── Loading / error states ────────────────────────────
  if (pagesQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <div className="space-y-3 w-full max-w-md px-4">
          {[70, 85, 60].map((h, i) => (
            <div
              key={i}
              className="w-full animate-pulse rounded bg-white/5"
              style={{ height: `${h}vh` }}
            />
          ))}
        </div>
      </div>
    )
  }

  const lastStatus = (pagesQuery.error as { response?: { status?: number } } | null)?.response?.status

  if (pagesQuery.isError && lastStatus === 503) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-white/50">
        <div className="text-center space-y-2">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
          <p className="text-sm">Waiting for archive pieces from the swarm…</p>
        </div>
      </div>
    )
  }

  if (pagesQuery.isError || totalPages === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-white/50">
        <p className="text-sm">No readable pages found in this torrent.</p>
      </div>
    )
  }

  return (
    <ReaderShell
      title={pages[currentPage]?.name ?? 'Reader'}
      pageLabel={`${currentPage + 1} / ${totalPages}`}
      readingMode={mode}
      onReadingModeChange={(m) => {
        setMode(m as ReadingMode)
        persist(currentPage, m as ReadingMode)
      }}
      fitMode={fitMode}
      onFitModeChange={setFitMode}
      direction={direction}
      onDirectionChange={setDirection}
      background={background}
      onBackgroundChange={setBackground}
      showModeControls
      onPrev={mode !== 'webtoon' ? goToPrev : null}
      onNext={mode !== 'webtoon' ? goToNext : null}
      hasPrev={currentPage > 0}
      hasNext={currentPage < totalPages - 1}
      settingsExtra={
        <>
          {/* Zoom slider */}
          <div className="space-y-2">
            <h4 className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--muted))]">Zoom</h4>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setZoom((z) => Math.max(50, z - 25))}
                className="rounded-md border border-[hsl(var(--border))] p-1.5 text-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))] disabled:opacity-40"
                disabled={zoom <= 50}
                aria-label="Zoom out"
              >
                <Minus className="h-4 w-4" />
              </button>
              <input
                type="range"
                min={50}
                max={300}
                step={10}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="flex-1 h-1.5 appearance-none rounded-full bg-[hsl(var(--border))] accent-[hsl(var(--accent))] cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5
                  [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[hsl(var(--accent))]"
                aria-label="Zoom level"
              />
              <button
                onClick={() => setZoom((z) => Math.min(300, z + 25))}
                className="rounded-md border border-[hsl(var(--border))] p-1.5 text-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))] disabled:opacity-40"
                disabled={zoom >= 300}
                aria-label="Zoom in"
              >
                <Plus className="h-4 w-4" />
              </button>
              <span className="min-w-[4ch] text-center text-sm tabular-nums text-[hsl(var(--muted))]">
                {zoom}%
              </span>
            </div>
          </div>

          {/* Brightness slider */}
          <div className="space-y-2">
            <h4 className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--muted))]">Brightness</h4>
            <div className="flex items-center gap-2">
              <Sun className="h-4 w-4 text-[hsl(var(--muted))]" />
              <input
                type="range"
                min={30}
                max={200}
                step={5}
                value={brightness}
                onChange={(e) => setBrightness(Number(e.target.value))}
                className="flex-1 h-1.5 appearance-none rounded-full bg-[hsl(var(--border))] accent-[hsl(var(--accent))] cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5
                  [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[hsl(var(--accent))]"
                aria-label="Brightness"
              />
              <span className="min-w-[4ch] text-center text-sm tabular-nums text-[hsl(var(--muted))]">
                {brightness}%
              </span>
            </div>
          </div>
        </>
      }
    >
      {mode === 'webtoon' ? (
        /* ── Webtoon (continuous scroll) ──────────── */
        <div
          ref={webtoonRef}
          className="mx-auto space-y-1 py-4"
          style={{
            maxWidth: `${Math.round(768 * zoom / 100)}px`,
            filter: brightness !== 100 ? `brightness(${brightness}%)` : undefined,
          }}
        >
          {pages.map((p, i) => (
            <PageImage
              key={`${p.fileId}:${p.entryIndex ?? '*'}`}
              src={pageStreamURL(p.fileId, p.entryIndex)}
              page={i}
              priority={Math.abs(i - currentPage) <= 3}
            />
          ))}
        </div>
      ) : mode === 'double-page' ? (
        /* ── Double page ──────────────────────────── */
        <div
          className="flex h-full items-center justify-center gap-1"
          dir={direction}
          style={{
            filter: brightness !== 100 ? `brightness(${brightness}%)` : undefined,
            maxWidth: `${zoom}%`,
            margin: '0 auto',
          }}
        >
          {pages[currentPage] && (
            <div className="flex-1 h-full flex items-center justify-center">
              <PageImage
                src={pageStreamURL(pages[currentPage].fileId, pages[currentPage].entryIndex)}
                page={currentPage}
                priority
              />
            </div>
          )}
          {pages[currentPage + 1] && (
            <div className="flex-1 h-full flex items-center justify-center">
              <PageImage
                src={pageStreamURL(pages[currentPage + 1].fileId, pages[currentPage + 1].entryIndex)}
                page={currentPage + 1}
                priority
              />
            </div>
          )}
        </div>
      ) : (
        /* ── Paginated (single page) ──────────────── */
        <div
          className="flex h-full w-full items-center justify-center overflow-auto"
          style={{
            filter: brightness !== 100 ? `brightness(${brightness}%)` : undefined,
          }}
        >
          <div
            style={{
              maxWidth: fitMode === 'fit-width' ? `${Math.round(1280 * zoom / 100)}px` : undefined,
              width: fitMode === 'fit-width' ? '100%' : 'auto',
              height: fitMode === 'fit-height' ? '100%' : 'auto',
            }}
          >
            <PageImage
              src={pageStreamURL(pages[currentPage].fileId, pages[currentPage].entryIndex)}
              page={currentPage}
              priority
            />
          </div>
        </div>
      )}
    </ReaderShell>
  )
}
