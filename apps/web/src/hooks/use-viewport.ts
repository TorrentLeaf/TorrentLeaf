'use client'

import { useEffect, useState } from 'react'

// Tracks viewport width to switch dashboard layouts (table↔cards,
// sidebar↔bottom-nav). Mirrors the reference dashboard's useViewport. SSR-safe:
// starts at a desktop default, then syncs on mount.
export function useViewport() {
  const [width, setWidth] = useState(1280)
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return { width, isMobile: width < 768, isTablet: width >= 768 && width < 1024 }
}
