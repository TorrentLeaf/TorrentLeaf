'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Maximize,
  Minimize,
  Minus,
  Plus,
} from 'lucide-react'
import type {
  PDFDocumentProxy,
  PDFPageProxy,
} from 'pdfjs-dist/types/src/display/api'

import { pageStreamURL } from '@/lib/reader'
import { useAuthStore } from '@/store/auth'
import { Button } from '@/components/ui/button'
import { useReaderKeyboard } from '@/hooks/use-reader-keyboard'
import { useReadingProgress } from '@/hooks/use-reading-progress'

export interface PdfReaderProps {
  fileId: string
}

const ZOOM_MIN = 0.5
const ZOOM_MAX = 3
const ZOOM_STEP = 0.25

// The PDF.js worker ships as an ESM module inside the package. Using
// `new URL` lets webpack/turbopack emit it as a static asset and generate
// a hashed URL at build time.
const workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

type PdfLib = typeof import('pdfjs-dist')

export function PdfReader({ fileId }: PdfReaderProps) {
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null)

  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [zoom, setZoom] = useState(1.25)
  const [error, setError] = useState<string | null>(null)
  const [restored, setRestored] = useState(false)

  const { progress, save } = useReadingProgress(fileId)

  // Load document (range-request enabled).
  useEffect(() => {
    let cancelled = false
    let doc: PDFDocumentProxy | null = null

    ;(async () => {
      try {
        const pdfjs: PdfLib = await import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = workerSrc

        const url = pageStreamURL(fileId)
        const token = useAuthStore.getState().accessToken ?? ''

        // PDF.js attaches these custom headers to every range request it
        // issues. We also pass ?token= on the URL, which is the mechanism
        // that actually authenticates the stream — the header is there for
        // symmetry with the rest of the API.
        const loadingTask = pdfjs.getDocument({
          url,
          httpHeaders: token ? { Authorization: `Bearer ${token}` } : undefined,
          withCredentials: false,
          rangeChunkSize: 65536,
          disableStream: false,
          disableAutoFetch: true,
        })
        doc = await loadingTask.promise
        if (cancelled) {
          await doc.destroy()
          return
        }
        setPdf(doc)
        setTotalPages(doc.numPages)
      } catch (e) {
        if (!cancelled) setError((e as Error).message || 'Failed to load PDF')
      }
    })()

    return () => {
      cancelled = true
      renderTaskRef.current?.cancel()
      doc?.destroy().catch(() => {})
    }
  }, [fileId])

  // Restore saved progress once document is known.
  useEffect(() => {
    if (restored || !pdf || !progress) return
    if (
      progress.currentPage > 0 &&
      progress.currentPage < pdf.numPages
    ) {
      setCurrentPage(progress.currentPage + 1) // progress is 0-indexed
    }
    setRestored(true)
  }, [pdf, progress, restored])

  // Render the current page onto the canvas.
  useEffect(() => {
    if (!pdf || !canvasRef.current) return
    let cancelled = false

    ;(async () => {
      renderTaskRef.current?.cancel()
      const page: PDFPageProxy = await pdf.getPage(currentPage)
      if (cancelled) return

      const viewport = page.getViewport({ scale: zoom })
      const canvas = canvasRef.current
      if (!canvas) return

      const dpr = window.devicePixelRatio || 1
      canvas.width = viewport.width * dpr
      canvas.height = viewport.height * dpr
      canvas.style.width = `${viewport.width}px`
      canvas.style.height = `${viewport.height}px`

      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const task = page.render({ canvasContext: ctx, viewport })
      renderTaskRef.current = task
      try {
        await task.promise
      } catch {
        // cancelled or failed; ignore
      }
    })()

    return () => {
      cancelled = true
    }
  }, [pdf, currentPage, zoom])

  const persist = useCallback(
    (page: number) => {
      if (!pdf) return
      save({
        currentPage: page - 1,
        totalPages: pdf.numPages,
        readingMode: 'paginated',
      })
    },
    [pdf, save],
  )

  const goToNext = useCallback(() => {
    setCurrentPage((p) => {
      const next = Math.min(p + 1, totalPages)
      if (next !== p) persist(next)
      return next
    })
  }, [totalPages, persist])

  const goToPrev = useCallback(() => {
    setCurrentPage((p) => {
      const next = Math.max(p - 1, 1)
      if (next !== p) persist(next)
      return next
    })
  }, [persist])

  const zoomIn = useCallback(
    () => setZoom((z) => Math.min(z + ZOOM_STEP, ZOOM_MAX)),
    [],
  )
  const zoomOut = useCallback(
    () => setZoom((z) => Math.max(z - ZOOM_STEP, ZOOM_MIN)),
    [],
  )

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
    } else {
      el.requestFullscreen().catch(() => {})
    }
  }, [])

  const escape = useCallback(() => router.back(), [router])

  useReaderKeyboard(
    useMemo(
      () => ({
        onNext: goToNext,
        onPrev: goToPrev,
        onToggleFullscreen: toggleFullscreen,
        onCycleMode: () => {}, // PDF reader is single-mode
        onEscape: escape,
      }),
      [goToNext, goToPrev, toggleFullscreen, escape],
    ),
  )

  const [isFullscreen, setIsFullscreen] = useState(false)
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[hsl(var(--background))] p-4 text-[hsl(var(--muted))]">
        <p className="text-sm">{error}</p>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="flex min-h-screen flex-col bg-[hsl(var(--background))] text-[hsl(var(--foreground))]"
    >
      <header className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]/80 px-4 py-2 backdrop-blur">
        <Button variant="ghost" size="icon" onClick={escape} aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <div className="flex items-center gap-1 text-xs text-[hsl(var(--muted))]">
          <Button
            variant="ghost"
            size="icon"
            onClick={zoomOut}
            aria-label="Zoom out"
            disabled={zoom <= ZOOM_MIN}
          >
            <Minus className="h-4 w-4" />
          </Button>
          <span className="min-w-[3ch] text-center tabular-nums">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={zoomIn}
            aria-label="Zoom in"
            disabled={zoom >= ZOOM_MAX}
          >
            <Plus className="h-4 w-4" />
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

      <main className="flex flex-1 items-start justify-center overflow-auto p-4">
        {pdf ? (
          <canvas
            ref={canvasRef}
            className="rounded-sm shadow-sm"
            aria-label={`Page ${currentPage} of ${totalPages}`}
          />
        ) : (
          <div className="mt-8 h-[70vh] w-full max-w-3xl animate-pulse rounded-sm bg-[hsl(var(--surface-2))]" />
        )}
      </main>

      <footer className="sticky bottom-0 z-20 flex items-center justify-center gap-3 border-t border-[hsl(var(--border))] bg-[hsl(var(--background))]/80 px-4 py-2 text-xs text-[hsl(var(--muted))] backdrop-blur">
        <Button
          variant="ghost"
          size="icon"
          onClick={goToPrev}
          aria-label="Previous page"
          disabled={currentPage <= 1}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="tabular-nums">
          {currentPage} / {totalPages || '—'}
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={goToNext}
          aria-label="Next page"
          disabled={currentPage >= totalPages}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </footer>
    </div>
  )
}
