'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  PDFDocumentProxy,
  PDFPageProxy,
} from 'pdfjs-dist/types/src/display/api'
import { Minus, Plus } from 'lucide-react'

import { pageStreamURL } from '@/lib/reader'
import { useAuthStore } from '@/store/auth'
import { useReadingProgress } from '@/hooks/use-reading-progress'
import { ReaderShell } from './ReaderShell'

export interface PdfReaderProps {
  fileId: string
}

const ZOOM_MIN = 0.5
const ZOOM_MAX = 3
const ZOOM_STEP = 0.25

const workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

type PdfLib = typeof import('pdfjs-dist')

export function PdfReader({ fileId }: PdfReaderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null)

  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [zoom, setZoom] = useState(1.25)
  const [error, setError] = useState<string | null>(null)
  const [restored, setRestored] = useState(false)
  const [background, setBackground] = useState('#1e1e1e')

  const { progress, save } = useReadingProgress(fileId)

  // ── Load PDF document ─────────────────────────────────
  useEffect(() => {
    let cancelled = false
    let doc: PDFDocumentProxy | null = null

    ;(async () => {
      try {
        const pdfjs: PdfLib = await import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = workerSrc

        const url = pageStreamURL(fileId)
        const token = useAuthStore.getState().accessToken ?? ''

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

  // ── Restore saved progress ────────────────────────────
  useEffect(() => {
    if (restored || !pdf || !progress) return
    if (progress.currentPage > 0 && progress.currentPage < pdf.numPages) {
      setCurrentPage(progress.currentPage + 1) // progress is 0-indexed
    }
    setRestored(true)
  }, [pdf, progress, restored])

  // ── Render page onto canvas ───────────────────────────
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
        // cancelled or failed
      }
    })()

    return () => { cancelled = true }
  }, [pdf, currentPage, zoom])

  // ── Persistence ───────────────────────────────────────
  const persist = useCallback(
    (page: number) => {
      if (!pdf) return
      save({ currentPage: page - 1, totalPages: pdf.numPages, readingMode: 'paginated' })
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



  // ── Error state ───────────────────────────────────────
  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-white/50">
        <div className="text-center space-y-3">
          <p className="text-sm">Failed to load PDF</p>
          <p className="text-xs text-white/30">{error}</p>
        </div>
      </div>
    )
  }



  return (
    <ReaderShell
      title="PDF Reader"
      pageLabel={totalPages > 0 ? `${currentPage} / ${totalPages}` : undefined}
      showModeControls={false}
      background={background}
      onBackgroundChange={setBackground}
      onPrev={goToPrev}
      onNext={goToNext}
      hasPrev={currentPage > 1}
      hasNext={currentPage < totalPages}
      settingsExtra={
        <div className="space-y-2">
          <h4 className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--muted))]">
            Zoom
          </h4>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setZoom((z) => Math.max(z - ZOOM_STEP, ZOOM_MIN))}
              disabled={zoom <= ZOOM_MIN}
              className="rounded-md border border-[hsl(var(--border))] p-1.5 text-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))] disabled:opacity-40"
              aria-label="Zoom out"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="min-w-[4ch] text-center text-sm tabular-nums">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom((z) => Math.min(z + ZOOM_STEP, ZOOM_MAX))}
              disabled={zoom >= ZOOM_MAX}
              className="rounded-md border border-[hsl(var(--border))] p-1.5 text-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))] disabled:opacity-40"
              aria-label="Zoom in"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
      }
    >
      <div className="flex h-full items-start justify-center overflow-auto p-4">
        {pdf ? (
          <canvas
            ref={canvasRef}
            className="rounded shadow-lg"
            aria-label={`Page ${currentPage} of ${totalPages}`}
          />
        ) : (
          <div className="mt-8 h-[70vh] w-full max-w-3xl animate-pulse rounded bg-white/5" />
        )}
      </div>
    </ReaderShell>
  )
}
