'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import ePub, { type Book, type Rendition } from 'epubjs'
import { Type, Minus, Plus } from 'lucide-react'

import { pageStreamURL } from '@/lib/reader'
import { useReadingProgress } from '@/hooks/use-reading-progress'
import { useUserSettings } from '@/hooks/use-user-settings'
import { ReaderShell } from './ReaderShell'

export interface EpubReaderProps {
  sessionId: string
  fileId: string
}

// EPUB only has two meaningful layouts: classic paginated columns, or one
// continuous scroll (epub.js `scrolled-doc`). We map the shared reader
// `defaultReadingMode` onto these: `webtoon` -> scrolled, everything else
// -> paginated.
type EpubMode = 'paginated' | 'scrolled'

const FONT_MIN = 80
const FONT_MAX = 200
const FONT_STEP = 10

export function EpubReader({ sessionId, fileId }: EpubReaderProps) {
  const viewerRef = useRef<HTMLDivElement>(null)
  const bookRef = useRef<Book | null>(null)
  const renditionRef = useRef<Rendition | null>(null)
  // Mirror of the latest CFI so we can re-anchor the rendition when the mode
  // changes without waiting on the (async) saved-progress query.
  const currentCfiRef = useRef<string | null>(null)

  const { progress, save } = useReadingProgress(fileId)
  const { settings } = useUserSettings()
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [buffer, setBuffer] = useState<ArrayBuffer | null>(null)
  const [background, setBackground] = useState(settings.readerBackground || '#1a1a2e')
  const [fontSize, setFontSize] = useState(100)
  const [mode, setMode] = useState<EpubMode>(
    settings.defaultReadingMode === 'webtoon' ? 'scrolled' : 'paginated',
  )
  const [title, setTitle] = useState('EPUB Reader')

  // ── Fetch the EPUB bytes once ─────────────────────────
  // Given a plain URL (our /stream/:id has no .epub extension) epub.js guesses
  // it's an *unpacked directory* and looks for META-INF/container.xml relative
  // to it, which 404s and leaves the reader spinning forever. An ArrayBuffer is
  // unambiguously a packaged epub. We fetch it a single time and reuse it when
  // the reading mode changes — only the rendition gets rebuilt, not the fetch.
  useEffect(() => {
    let cancelled = false

    const load = async () => {
      while (true) {
        try {
          const res = await fetch(pageStreamURL(fileId))
          if (cancelled) return
          if (res.status === 503) {
            const retry = Number(res.headers.get('Retry-After')) || 5
            await new Promise((r) => setTimeout(r, retry * 1000))
            continue
          }
          if (!res.ok) {
            setError(`Failed to fetch EPUB (HTTP ${res.status})`)
            return
          }
          const buf = await res.arrayBuffer()
          if (!cancelled) setBuffer(buf)
          return
        } catch (err) {
          if (cancelled) return
          setError((err as Error).message || 'Failed to fetch EPUB')
          return
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [fileId])

  // ── Build the book from the bytes ─────────────────────
  useEffect(() => {
    if (!buffer) return
    const book = ePub(buffer)
    bookRef.current = book

    let cancelled = false
    book.loaded.metadata.then((meta) => {
      if (!cancelled && meta.title) setTitle(meta.title)
    })

    return () => {
      cancelled = true
      book.destroy()
      bookRef.current = null
    }
  }, [buffer])

  // ── Render (rebuilds only when bytes or mode change) ──
  useEffect(() => {
    const host = viewerRef.current
    const book = bookRef.current
    if (!buffer || !book || !host) return

    let cancelled = false
    setReady(false)

    const rendition = book.renderTo(host, {
      width: '100%',
      height: '100%',
      flow: mode === 'scrolled' ? 'scrolled-doc' : 'paginated',
      spread: mode === 'scrolled' ? 'none' : 'auto',
      allowScriptedContent: false,
    })
    renditionRef.current = rendition

    // Style the book content for dark mode
    rendition.themes.default({
      body: {
        color: '#e0e0e0 !important',
        'background-color': 'transparent !important',
      },
      'a, a:link, a:visited': {
        color: '#90caf9 !important',
      },
    })
    rendition.themes.fontSize(`${fontSize}%`)

    // Re-anchor at the last known position so switching modes doesn't lose the
    // reader's place; fall back to saved progress on first render.
    const startAt =
      currentCfiRef.current ||
      (progress?.location && progress.location.length > 0 ? progress.location : undefined)

    rendition
      .display(startAt)
      .then(() => !cancelled && setReady(true))
      .catch((err: unknown) => {
        if (!cancelled) setError((err as Error).message || 'Failed to render EPUB')
      })

    // Persist CFI on every relocation
    rendition.on('relocated', (loc: { start: { cfi: string } }) => {
      if (loc?.start?.cfi) {
        currentCfiRef.current = loc.start.cfi
        save({ currentPage: 0, location: loc.start.cfi })
      }
    })

    return () => {
      cancelled = true
      rendition.destroy()
      if (renditionRef.current === rendition) renditionRef.current = null
    }
    // fontSize is applied live by the effect below; don't rebuild on it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buffer, mode])

  // ── Font size changes ─────────────────────────────────
  useEffect(() => {
    if (renditionRef.current) {
      renditionRef.current.themes.fontSize(`${fontSize}%`)
    }
  }, [fontSize])

  // ── Navigation ────────────────────────────────────────
  const goNext = useCallback(() => {
    renditionRef.current?.next()
  }, [])

  const goPrev = useCallback(() => {
    renditionRef.current?.prev()
  }, [])

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-white/50">
        <div className="text-center space-y-3">
          <p className="text-sm">Failed to load EPUB</p>
          <p className="text-xs text-white/30">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <ReaderShell
      title={title}
      showModeControls={false}
      background={background}
      onBackgroundChange={setBackground}
      onPrev={goPrev}
      onNext={goNext}
      settingsExtra={
        <>
        <div className="space-y-2">
          <h4 className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--muted))]">
            Reading mode
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {(['paginated', 'scrolled'] as EpubMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`rounded-md border px-2.5 py-1 text-sm transition-all ${
                  mode === m
                    ? 'border-[hsl(var(--accent))] bg-[hsl(var(--accent))]/10 text-[hsl(var(--accent))]'
                    : 'border-[hsl(var(--border))] text-[hsl(var(--muted))] hover:border-[hsl(var(--accent))]/40'
                }`}
              >
                {m === 'paginated' ? 'Paginated' : 'Scrolled'}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <h4 className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--muted))]">
            Font size
          </h4>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFontSize((s) => Math.max(s - FONT_STEP, FONT_MIN))}
              disabled={fontSize <= FONT_MIN}
              className="rounded-md border border-[hsl(var(--border))] p-1.5 text-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))] disabled:opacity-40"
              aria-label="Decrease font size"
            >
              <Minus className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-1">
              <Type className="h-4 w-4 text-[hsl(var(--muted))]" />
              <span className="min-w-[4ch] text-center text-sm tabular-nums">
                {fontSize}%
              </span>
            </div>
            <button
              onClick={() => setFontSize((s) => Math.min(s + FONT_STEP, FONT_MAX))}
              disabled={fontSize >= FONT_MAX}
              className="rounded-md border border-[hsl(var(--border))] p-1.5 text-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))] disabled:opacity-40"
              aria-label="Increase font size"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
        </>
      }
    >
      <div className="relative h-full w-full">
        {!ready && !error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
          </div>
        )}
        <div
          ref={viewerRef}
          className="mx-auto h-full max-w-4xl"
          style={{ opacity: ready ? 1 : 0 }}
        />
      </div>
    </ReaderShell>
  )
}
