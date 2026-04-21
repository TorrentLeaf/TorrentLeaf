'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'
import ePub, { type Book, type Rendition } from 'epubjs'

import { pageStreamURL } from '@/lib/reader'
import { Button } from '@/components/ui/button'
import { useReadingProgress } from '@/hooks/use-reading-progress'

export interface EpubReaderProps {
  sessionId: string
  fileId: string
}

export function EpubReader({ sessionId, fileId }: EpubReaderProps) {
  const router = useRouter()
  const viewerRef = useRef<HTMLDivElement>(null)
  const bookRef = useRef<Book | null>(null)
  const renditionRef = useRef<Rendition | null>(null)

  const { progress, save } = useReadingProgress(fileId)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // One-shot setup keyed by fileId. We intentionally do NOT re-run on progress
  // changes — the restored location is applied once via display(lastLocation).
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

    // Restore to the saved CFI if available; otherwise start at the book's
    // first linear section.
    const startAt = progress?.location && progress.location.length > 0
      ? progress.location
      : undefined
    rendition.display(startAt).then(() => setReady(true)).catch((err: unknown) => {
      setError((err as Error).message || 'failed to render epub')
    })

    // Persist CFI on every relocation, debounced by the hook.
    rendition.on('relocated', (loc: { start: { cfi: string } }) => {
      if (loc?.start?.cfi) {
        save({ currentPage: 0, location: loc.start.cfi })
      }
    })

    return () => {
      rendition.destroy()
      book.destroy()
      bookRef.current = null
      renditionRef.current = null
    }
    // Disable exhaustive-deps on purpose: we want a single init per fileId.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId])

  const next = () => renditionRef.current?.next()
  const prev = () => renditionRef.current?.prev()

  // Arrow-key navigation; wire directly to rendition refs instead of state.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown') next()
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') prev()
      if (e.key === 'Escape') router.push(`/torrents/${sessionId}` as never)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [router, sessionId])

  return (
    <div className="flex min-h-screen flex-col bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <header className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]/80 px-4 py-2 backdrop-blur">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push(`/torrents/${sessionId}` as never)}
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="text-xs text-[hsl(var(--muted))]">EPUB reader</span>
      </header>

      <main className="relative flex-1">
        {error && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-[hsl(var(--destructive))]">
            {error}
          </div>
        )}
        {!ready && !error && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-[hsl(var(--muted))]">
            Loading book…
          </div>
        )}
        <div
          ref={viewerRef}
          className="mx-auto h-[calc(100vh-7rem)] max-w-4xl"
        />
        <button
          type="button"
          aria-label="Previous page"
          onClick={prev}
          className="absolute inset-y-0 left-0 w-1/6 cursor-pointer bg-transparent"
        />
        <button
          type="button"
          aria-label="Next page"
          onClick={next}
          className="absolute inset-y-0 right-0 w-1/6 cursor-pointer bg-transparent"
        />
      </main>

      <footer className="sticky bottom-0 z-20 flex items-center justify-center gap-3 border-t border-[hsl(var(--border))] bg-[hsl(var(--background))]/80 px-4 py-2 backdrop-blur">
        <Button variant="ghost" size="sm" onClick={prev} aria-label="Previous">
          <ChevronLeft className="mr-1 h-4 w-4" />
          Prev
        </Button>
        <Button variant="ghost" size="sm" onClick={next} aria-label="Next">
          Next
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </footer>
    </div>
  )
}
