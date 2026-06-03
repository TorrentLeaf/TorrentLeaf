'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import ePub, { type Book, type Rendition } from 'epubjs'
import { Type, Minus, Plus } from 'lucide-react'

import { pageStreamURL } from '@/lib/reader'
import { useReadingProgress } from '@/hooks/use-reading-progress'
import { ReaderShell } from './ReaderShell'

export interface EpubReaderProps {
  sessionId: string
  fileId: string
}

const FONT_MIN = 80
const FONT_MAX = 200
const FONT_STEP = 10

export function EpubReader({ sessionId, fileId }: EpubReaderProps) {
  const viewerRef = useRef<HTMLDivElement>(null)
  const bookRef = useRef<Book | null>(null)
  const renditionRef = useRef<Rendition | null>(null)

  const { progress, save } = useReadingProgress(fileId)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [background, setBackground] = useState('#1a1a2e')
  const [fontSize, setFontSize] = useState(100)
  const [title, setTitle] = useState('EPUB Reader')
  const [currentCfi, setCurrentCfi] = useState<string | null>(null)

  // ── Init book ─────────────────────────────────────────
  useEffect(() => {
    const host = viewerRef.current
    if (!host) return

    const url = pageStreamURL(fileId)
    const book = ePub(url)
    bookRef.current = book

    const rendition = book.renderTo(host, {
      width: '100%',
      height: '100%',
      flow: 'paginated',
      spread: 'auto',
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

    const startAt =
      progress?.location && progress.location.length > 0
        ? progress.location
        : undefined

    rendition
      .display(startAt)
      .then(() => setReady(true))
      .catch((err: unknown) => {
        setError((err as Error).message || 'Failed to render EPUB')
      })

    // Read metadata for title
    book.loaded.metadata.then((meta) => {
      if (meta.title) setTitle(meta.title)
    })

    // Persist CFI on every relocation
    rendition.on('relocated', (loc: { start: { cfi: string } }) => {
      if (loc?.start?.cfi) {
        setCurrentCfi(loc.start.cfi)
        save({ currentPage: 0, location: loc.start.cfi })
      }
    })

    return () => {
      rendition.destroy()
      book.destroy()
      bookRef.current = null
      renditionRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId])

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
