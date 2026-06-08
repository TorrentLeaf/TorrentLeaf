'use client'

import { useEffect, useState } from 'react'

// Tracks the user's `prefers-reduced-motion` setting. Used to disable the
// landing preview's animation loop (render the final static state instead).
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}
