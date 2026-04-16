'use client'

import { useEffect } from 'react'

export interface ReaderKeyboardHandlers {
  onNext: () => void
  onPrev: () => void
  onToggleFullscreen: () => void
  onCycleMode: () => void
  onEscape: () => void
}

/**
 * useReaderKeyboard wires the canonical reader shortcuts. Keys are ignored
 * when focus lives in an editable element (inputs, textareas, contentEditable)
 * so typing into a search field never turns the page.
 */
export function useReaderKeyboard(handlers: ReaderKeyboardHandlers) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) {
          return
        }
      }

      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
        case ' ':
          e.preventDefault()
          handlers.onNext()
          break
        case 'ArrowLeft':
        case 'ArrowUp':
          e.preventDefault()
          handlers.onPrev()
          break
        case 'f':
        case 'F':
          e.preventDefault()
          handlers.onToggleFullscreen()
          break
        case 'm':
        case 'M':
          e.preventDefault()
          handlers.onCycleMode()
          break
        case 'Escape':
          handlers.onEscape()
          break
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handlers])
}
