import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useReaderKeyboard } from './use-reader-keyboard'

function press(key: string, target?: HTMLElement) {
  const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  if (target) {
    Object.defineProperty(ev, 'target', { value: target })
  }
  window.dispatchEvent(ev)
  return ev
}

function baseHandlers() {
  return {
    onNext: vi.fn(),
    onPrev: vi.fn(),
    onToggleFullscreen: vi.fn(),
    onCycleMode: vi.fn(),
    onEscape: vi.fn(),
  }
}

describe('useReaderKeyboard', () => {
  it('maps ArrowRight / ArrowDown / Space to onNext', () => {
    const h = baseHandlers()
    renderHook(() => useReaderKeyboard(h))
    press('ArrowRight')
    press('ArrowDown')
    press(' ')
    expect(h.onNext).toHaveBeenCalledTimes(3)
  })

  it('maps ArrowLeft / ArrowUp to onPrev', () => {
    const h = baseHandlers()
    renderHook(() => useReaderKeyboard(h))
    press('ArrowLeft')
    press('ArrowUp')
    expect(h.onPrev).toHaveBeenCalledTimes(2)
  })

  it('f/F toggles fullscreen, m/M cycles mode, Escape escapes', () => {
    const h = baseHandlers()
    renderHook(() => useReaderKeyboard(h))
    press('f')
    press('F')
    press('m')
    press('M')
    press('Escape')
    expect(h.onToggleFullscreen).toHaveBeenCalledTimes(2)
    expect(h.onCycleMode).toHaveBeenCalledTimes(2)
    expect(h.onEscape).toHaveBeenCalledTimes(1)
  })

  it('ignores keys while focus is in an INPUT so typing does not turn pages', () => {
    const h = baseHandlers()
    renderHook(() => useReaderKeyboard(h))
    const input = document.createElement('input')
    document.body.appendChild(input)
    press('ArrowRight', input)
    expect(h.onNext).not.toHaveBeenCalled()
    input.remove()
  })

  it('unbinds the listener on unmount', () => {
    const h = baseHandlers()
    const { unmount } = renderHook(() => useReaderKeyboard(h))
    unmount()
    press('ArrowRight')
    expect(h.onNext).not.toHaveBeenCalled()
  })
})
