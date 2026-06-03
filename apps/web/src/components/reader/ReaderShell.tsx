'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Maximize,
  Minimize,
  Settings2,
  X,
} from 'lucide-react'

// ─── Types ─────────────────────────────────────────────
export type ReadingMode = 'paginated' | 'webtoon' | 'double-page'
export type FitMode = 'fit-width' | 'fit-height' | 'original'
export type Direction = 'ltr' | 'rtl'

export interface ReaderShellProps {
  title: string
  pageLabel?: string

  readingMode?: ReadingMode
  onReadingModeChange?: (mode: ReadingMode) => void
  fitMode?: FitMode
  onFitModeChange?: (mode: FitMode) => void
  direction?: Direction
  onDirectionChange?: (dir: Direction) => void
  background?: string
  onBackgroundChange?: (bg: string) => void

  showModeControls?: boolean

  onPrev?: (() => void) | null
  onNext?: (() => void) | null
  hasPrev?: boolean
  hasNext?: boolean

  settingsExtra?: ReactNode
  children: ReactNode
}

const AUTO_HIDE_MS = 3000

const BACKGROUNDS = [
  { value: '#000000', label: 'Black' },
  { value: '#1a1a2e', label: 'Dark Blue' },
  { value: '#1e1e1e', label: 'Dark Gray' },
  { value: '#ffffff', label: 'White' },
]

export function ReaderShell({
  title,
  pageLabel,
  readingMode,
  onReadingModeChange,
  fitMode,
  onFitModeChange,
  direction,
  onDirectionChange,
  background = '#000000',
  onBackgroundChange,
  showModeControls = true,
  onPrev,
  onNext,
  hasPrev = true,
  hasNext = true,
  settingsExtra,
  children,
}: ReaderShellProps) {
  const router = useRouter()
  const [overlayVisible, setOverlayVisible] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const resetHideTimer = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    setOverlayVisible(true)
    hideTimer.current = setTimeout(() => {
      if (!settingsOpen) setOverlayVisible(false)
    }, AUTO_HIDE_MS)
  }, [settingsOpen])

  useEffect(() => {
    resetHideTimer()
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current) }
  }, [resetHideTimer])

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      switch (e.key) {
        case 'ArrowLeft':
          direction === 'rtl' ? onNext?.() : onPrev?.()
          break
        case 'ArrowRight':
        case ' ':
          e.preventDefault()
          direction === 'rtl' ? onPrev?.() : onNext?.()
          break
        case 'f':
        case 'F':
          toggleFullscreen()
          break
        case 'm':
        case 'M':
          if (onReadingModeChange && readingMode) {
            const modes: ReadingMode[] = ['paginated', 'webtoon', 'double-page']
            const next = modes[(modes.indexOf(readingMode) + 1) % modes.length]
            onReadingModeChange(next)
          }
          break
        case 'Escape':
          if (settingsOpen) setSettingsOpen(false)
          else router.back()
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [direction, onPrev, onNext, onReadingModeChange, readingMode, router, settingsOpen])

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen()
      setIsFullscreen(true)
    } else {
      document.exitFullscreen()
      setIsFullscreen(false)
    }
  }

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  return (
    <div
      ref={containerRef}
      onMouseMove={resetHideTimer}
      style={{ backgroundColor: background }}
      className="fixed inset-0 z-[100] flex flex-col overflow-hidden"
    >
      {/* ── Top bar ─────────────────────────────── */}
      <div
        className={`absolute inset-x-0 top-0 z-50 flex items-center justify-between px-3 py-2 transition-all duration-300 ${
          overlayVisible
            ? 'translate-y-0 opacity-100'
            : '-translate-y-full opacity-0 pointer-events-none'
        }`}
        style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, transparent 100%)' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => router.back()}
            className="shrink-0 rounded-full p-1.5 text-white/80 hover:bg-white/10 transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h2 className="truncate text-sm text-white/80">{title}</h2>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {pageLabel && (
            <span className="mr-1 text-xs tabular-nums text-white/60">{pageLabel}</span>
          )}
          <button
            onClick={() => setSettingsOpen(true)}
            className="rounded-full p-1.5 text-white/60 hover:bg-white/10 hover:text-white transition-colors"
            aria-label="Reader settings"
          >
            <Settings2 className="h-4 w-4" />
          </button>
          <button
            onClick={toggleFullscreen}
            className="rounded-full p-1.5 text-white/60 hover:bg-white/10 hover:text-white transition-colors"
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* ── Content ──────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        {children}
      </div>

      {/* ── Side nav arrows (paginated modes only) ─ */}
      {onPrev && (
        <button
          onClick={onPrev}
          disabled={!hasPrev}
          className={`absolute left-0 top-12 bottom-0 w-16 sm:w-24 z-10 flex items-center justify-start pl-2
            opacity-0 hover:opacity-100 transition-opacity ${!hasPrev ? 'pointer-events-none' : 'cursor-pointer'}`}
          aria-label="Previous page"
        >
          <div className="rounded-full bg-black/40 p-2">
            <ChevronLeft className="h-6 w-6 text-white/70" />
          </div>
        </button>
      )}
      {onNext && (
        <button
          onClick={onNext}
          disabled={!hasNext}
          className={`absolute right-0 top-12 bottom-0 w-16 sm:w-24 z-10 flex items-center justify-end pr-2
            opacity-0 hover:opacity-100 transition-opacity ${!hasNext ? 'pointer-events-none' : 'cursor-pointer'}`}
          aria-label="Next page"
        >
          <div className="rounded-full bg-black/40 p-2">
            <ChevronRight className="h-6 w-6 text-white/70" />
          </div>
        </button>
      )}

      {/* ── Settings drawer ──────────────────────── */}
      {settingsOpen && (
        <>
          <div className="fixed inset-0 z-[60] bg-black/50" onClick={() => setSettingsOpen(false)} />
          <div className="fixed right-0 top-0 bottom-0 z-[70] w-72 sm:w-80 overflow-y-auto bg-[hsl(var(--background))] border-l border-[hsl(var(--border))] p-4 shadow-2xl animate-in slide-in-from-right">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold">Settings</h3>
              <button
                onClick={() => setSettingsOpen(false)}
                className="rounded-full p-1 hover:bg-[hsl(var(--surface-2))] transition-colors"
                aria-label="Close settings"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-5">
              {showModeControls && readingMode && onReadingModeChange && (
                <Section title="Reading mode">
                  {(['paginated', 'webtoon', 'double-page'] as ReadingMode[]).map((mode) => (
                    <Chip key={mode} active={readingMode === mode} onClick={() => onReadingModeChange(mode)}>
                      {mode === 'double-page' ? 'Double Page' : mode.charAt(0).toUpperCase() + mode.slice(1)}
                    </Chip>
                  ))}
                </Section>
              )}

              {fitMode && onFitModeChange && (
                <Section title="Fit mode">
                  {(['fit-width', 'fit-height', 'original'] as FitMode[]).map((mode) => (
                    <Chip key={mode} active={fitMode === mode} onClick={() => onFitModeChange(mode)}>
                      {mode.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                    </Chip>
                  ))}
                </Section>
              )}

              {direction !== undefined && onDirectionChange && (
                <Section title="Direction">
                  <Chip active={direction === 'ltr'} onClick={() => onDirectionChange('ltr')}>Left → Right</Chip>
                  <Chip active={direction === 'rtl'} onClick={() => onDirectionChange('rtl')}>Right → Left</Chip>
                </Section>
              )}

              {onBackgroundChange && (
                <Section title="Background">
                  <div className="flex gap-2">
                    {BACKGROUNDS.map((bg) => (
                      <button
                        key={bg.value}
                        onClick={() => onBackgroundChange(bg.value)}
                        aria-label={`Background: ${bg.label}`}
                        className={`h-7 w-7 rounded-full border-2 transition-all ${
                          background === bg.value
                            ? 'border-[hsl(var(--accent))] ring-2 ring-[hsl(var(--accent))]/30'
                            : 'border-[hsl(var(--border))]'
                        }`}
                        style={{ backgroundColor: bg.value }}
                      />
                    ))}
                  </div>
                </Section>
              )}

              {settingsExtra}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--muted))]">{title}</h4>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-2.5 py-1 text-sm transition-all ${
        active
          ? 'border-[hsl(var(--accent))] bg-[hsl(var(--accent))]/10 text-[hsl(var(--accent))]'
          : 'border-[hsl(var(--border))] text-[hsl(var(--muted))] hover:border-[hsl(var(--accent))]/40'
      }`}
    >
      {children}
    </button>
  )
}
