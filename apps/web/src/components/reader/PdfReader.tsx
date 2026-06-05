'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  PDFDocumentProxy,
  PDFPageProxy,
} from 'pdfjs-dist/types/src/display/api'
import { Minus, Plus, Sun } from 'lucide-react'

type RenderTask = { cancel: () => void; promise: Promise<void> }

import { pageStreamURL, type ReadingMode } from '@/lib/reader'
import { useAuthStore } from '@/store/auth'
import { useReadingProgress } from '@/hooks/use-reading-progress'
import { useUserSettings } from '@/hooks/use-user-settings'
import { ReaderShell, type FitMode } from './ReaderShell'

export interface PdfReaderProps {
  fileId: string
}

const workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

type PdfLib = typeof import('pdfjs-dist')

const PADDING = 32

/** Render scale for a page given the fit mode, zoom and container size,
 *  mirroring the manga reader's fit-width/-height/original behaviour. */
function computeScale(
  page: PDFPageProxy,
  fitMode: FitMode,
  zoomPct: number,
  cw: number,
  ch: number,
): number {
  const base = page.getViewport({ scale: 1 })
  const z = zoomPct / 100
  if (fitMode === 'fit-width' && cw > 0) {
    return ((cw - PADDING) / base.width) * z
  }
  if (fitMode === 'fit-height' && ch > 0) {
    return ((ch - PADDING) / base.height) * z
  }
  return 1.5 * z // "original" — a comfortable base scale
}

// ─── Single page (lazy canvas) ─────────────────────────
interface PdfPageProps {
  pdf: PDFDocumentProxy
  pageNumber: number // 1-based
  fitMode: FitMode
  zoom: number
  containerWidth: number
  containerHeight: number
  eager: boolean
  onVisible?: (page: number) => void
}

function PdfPage({
  pdf, pageNumber, fitMode, zoom, containerWidth, containerHeight, eager, onVisible,
}: PdfPageProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const taskRef = useRef<RenderTask | null>(null)
  const [visible, setVisible] = useState(eager)

  // Render only when near the viewport (continuous scroll can hold hundreds
  // of pages — rendering them all up front would be far too heavy).
  useEffect(() => {
    const el = wrapRef.current
    if (!el || visible) return
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setVisible(true) },
      { rootMargin: '1000px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [visible])

  // Report visibility for current-page tracking in continuous mode.
  useEffect(() => {
    const el = wrapRef.current
    if (!el || !onVisible) return
    const io = new IntersectionObserver(
      (entries) => {
        const e = entries[0]
        if (e.isIntersecting && e.intersectionRatio > 0.4) onVisible(pageNumber - 1)
      },
      { threshold: [0.4, 0.6] },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [onVisible, pageNumber])

  useEffect(() => {
    if (!visible) return
    let cancelled = false
    ;(async () => {
      taskRef.current?.cancel()
      const page = await pdf.getPage(pageNumber)
      if (cancelled) return
      const scale = computeScale(page, fitMode, zoom, containerWidth, containerHeight)
      const vp = page.getViewport({ scale })
      const canvas = canvasRef.current
      if (!canvas) return
      const dpr = window.devicePixelRatio || 1
      canvas.width = vp.width * dpr
      canvas.height = vp.height * dpr
      canvas.style.width = `${vp.width}px`
      canvas.style.height = `${vp.height}px`
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const task = page.render({ canvasContext: ctx, viewport: vp })
      taskRef.current = task
      try { await task.promise } catch { /* cancelled */ }
    })()
    return () => { cancelled = true; taskRef.current?.cancel() }
  }, [visible, pdf, pageNumber, fitMode, zoom, containerWidth, containerHeight])

  // Placeholder keeps layout height before the page renders (A4-ish ratio).
  const phWidth = fitMode === 'fit-width' && containerWidth > 0
    ? Math.min(containerWidth - PADDING, (containerWidth - PADDING) * (zoom / 100))
    : 600
  return (
    <div ref={wrapRef} data-page={pageNumber - 1} className="flex justify-center">
      {visible ? (
        <canvas ref={canvasRef} className="max-w-full rounded shadow-lg" />
      ) : (
        <div
          className="animate-pulse rounded bg-white/5"
          style={{ width: phWidth, height: phWidth * 1.414 }}
        />
      )}
    </div>
  )
}

export function PdfReader({ fileId }: PdfReaderProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const { settings } = useUserSettings()
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [currentPage, setCurrentPage] = useState(0) // 0-based
  const [totalPages, setTotalPages] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [restored, setRestored] = useState(false)

  // ── State initialized from user settings (like MangaReader) ──
  const [mode, setMode] = useState<ReadingMode>(settings.defaultReadingMode as ReadingMode)
  const [fitMode, setFitMode] = useState<FitMode>(settings.defaultFitMode as FitMode)
  const [background, setBackground] = useState(settings.readerBackground || '#1e1e1e')
  const [zoom, setZoom] = useState(100)
  const [brightness, setBrightness] = useState(100)

  // ── Container size (drives fit-width / fit-height) ──────
  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [pdf])

  const { progress, save } = useReadingProgress(fileId)

  // ── Load document ─────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    let doc: PDFDocumentProxy | null = null
    ;(async () => {
      try {
        const pdfjs: PdfLib = await import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = workerSrc
        // Auth rides on the ?token= query string already baked into the URL;
        // sending an Authorization header too would force a CORS preflight on
        // every range request and slow things down.
        const loadingTask = pdfjs.getDocument({
          url: pageStreamURL(fileId),
          withCredentials: false,
          rangeChunkSize: 65536,
          disableStream: false,
          disableAutoFetch: true,
        })
        doc = await loadingTask.promise
        if (cancelled) { await doc.destroy(); return }
        setPdf(doc)
        setTotalPages(doc.numPages)
      } catch (e) {
        if (!cancelled) setError((e as Error).message || 'Failed to load PDF')
      }
    })()
    return () => { cancelled = true; doc?.destroy().catch(() => {}) }
  }, [fileId])

  // ── Restore saved progress ────────────────────────────
  useEffect(() => {
    if (restored || !pdf) return
    if (progress) {
      if (progress.currentPage > 0 && progress.currentPage < pdf.numPages) {
        setCurrentPage(progress.currentPage)
      }
      if (progress.readingMode) setMode(progress.readingMode as ReadingMode)
    }
    setRestored(true)
  }, [pdf, progress, restored])

  const persist = useCallback(
    (page: number, nextMode: ReadingMode = mode) => {
      if (!pdf) return
      save({ currentPage: page, totalPages: pdf.numPages, readingMode: nextMode })
    },
    [pdf, save, mode],
  )

  // ── Paginated navigation ──────────────────────────────
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

  // Track current page while scrolling in continuous (webtoon) mode.
  const onPageVisible = useCallback((page: number) => {
    setCurrentPage((prev) => {
      if (prev !== page) persist(page)
      return page
    })
  }, [persist])

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

  const dimFilter = brightness !== 100 ? `brightness(${brightness}%)` : undefined

  return (
    <ReaderShell
      title="PDF Reader"
      pageLabel={totalPages > 0 ? `${currentPage + 1} / ${totalPages}` : undefined}
      readingMode={mode}
      onReadingModeChange={(m) => { setMode(m); persist(currentPage, m) }}
      fitMode={fitMode}
      onFitModeChange={setFitMode}
      background={background}
      onBackgroundChange={setBackground}
      showModeControls
      onPrev={mode !== 'webtoon' ? goToPrev : null}
      onNext={mode !== 'webtoon' ? goToNext : null}
      hasPrev={currentPage > 0}
      hasNext={currentPage < totalPages - 1}
      settingsExtra={
        <>
          <div className="space-y-2">
            <h4 className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--muted))]">Zoom</h4>
            <div className="flex items-center gap-2">
              <button onClick={() => setZoom((z) => Math.max(50, z - 10))} disabled={zoom <= 50}
                className="rounded-md border border-[hsl(var(--border))] p-1.5 text-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))] disabled:opacity-40" aria-label="Zoom out">
                <Minus className="h-4 w-4" />
              </button>
              <input type="range" min={50} max={300} step={10} value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="flex-1 h-1.5 appearance-none rounded-full bg-[hsl(var(--border))] accent-[hsl(var(--accent))] cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5
                  [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[hsl(var(--accent))]" aria-label="Zoom level" />
              <span className="min-w-[4ch] text-center text-sm tabular-nums text-[hsl(var(--muted))]">{zoom}%</span>
            </div>
          </div>
          <div className="space-y-2">
            <h4 className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--muted))]">Brightness</h4>
            <div className="flex items-center gap-2">
              <Sun className="h-4 w-4 text-[hsl(var(--muted))]" />
              <input type="range" min={30} max={200} step={5} value={brightness}
                onChange={(e) => setBrightness(Number(e.target.value))}
                className="flex-1 h-1.5 appearance-none rounded-full bg-[hsl(var(--border))] accent-[hsl(var(--accent))] cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5
                  [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[hsl(var(--accent))]" aria-label="Brightness" />
              <span className="min-w-[4ch] text-center text-sm tabular-nums text-[hsl(var(--muted))]">{brightness}%</span>
            </div>
          </div>
        </>
      }
    >
      <div ref={scrollRef} className="h-full w-full overflow-auto">
        {!pdf ? (
          <div className="flex h-full items-start justify-center p-4">
            <div className="mt-8 h-[70vh] w-full max-w-3xl animate-pulse rounded bg-white/5" />
          </div>
        ) : mode === 'webtoon' ? (
          /* ── Continuous scroll ─────────────────────── */
          <div className="mx-auto flex max-w-5xl flex-col items-center gap-2 py-4" style={{ filter: dimFilter }}>
            {Array.from({ length: totalPages }, (_, i) => (
              <PdfPage
                key={i}
                pdf={pdf}
                pageNumber={i + 1}
                fitMode={fitMode}
                zoom={zoom}
                containerWidth={size.w}
                containerHeight={size.h}
                eager={Math.abs(i - currentPage) <= 2}
                onVisible={onPageVisible}
              />
            ))}
          </div>
        ) : mode === 'double-page' ? (
          /* ── Double page ───────────────────────────── */
          <div className="flex h-full items-center justify-center gap-2 p-4" style={{ filter: dimFilter }}>
            <PdfPage pdf={pdf} pageNumber={currentPage + 1} fitMode={fitMode} zoom={zoom}
              containerWidth={size.w / 2} containerHeight={size.h} eager />
            {currentPage + 1 < totalPages && (
              <PdfPage pdf={pdf} pageNumber={currentPage + 2} fitMode={fitMode} zoom={zoom}
                containerWidth={size.w / 2} containerHeight={size.h} eager />
            )}
          </div>
        ) : (
          /* ── Single page (paginated) ───────────────── */
          <div className="flex min-h-full items-start justify-center p-4" style={{ filter: dimFilter }}>
            <PdfPage pdf={pdf} pageNumber={currentPage + 1} fitMode={fitMode} zoom={zoom}
              containerWidth={size.w} containerHeight={size.h} eager />
          </div>
        )}
      </div>
    </ReaderShell>
  )
}
