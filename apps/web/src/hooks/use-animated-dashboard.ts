'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

import { INITIAL_TORRENTS, type DashboardFilter, type DashboardTorrent } from '@/lib/dashboard'
import { useReducedMotion } from '@/hooks/use-reduced-motion'

// ─────────────────────────────────────────────────────────────────────────────
// Single requestAnimationFrame loop driving ALL the landing preview's mock data.
// Ported from design components.reference.jsx (useAnimatedDashboard). Every value
// here is FAKE — it only feeds the marketing preview, never the real /library.
// Under prefers-reduced-motion the loop never starts (final static state).
// ─────────────────────────────────────────────────────────────────────────────
export function useAnimatedDashboard() {
  const reducedMotion = useReducedMotion()

  const [torrents, setTorrents] = useState<DashboardTorrent[]>(INITIAL_TORRENTS)
  const [downRate, setDownRate] = useState(15.3)
  const [upRate, setUpRate] = useState(10.3)
  const [elapsed, setElapsed] = useState(8 * 60 + 32)
  const [downloadedMB, setDownloadedMB] = useState(677)
  const [uploadedMB, setUploadedMB] = useState(146)
  // Deterministic seed (no Math.random) so the SSR and first client render match
  // — otherwise the chart's SVG path differs and React throws a hydration
  // mismatch. The RAF loop (client-only) introduces the live jitter afterwards.
  const [history, setHistory] = useState<number[]>(() => {
    const arr: number[] = []
    for (let i = 0; i < 60; i++) arr.push(15 + Math.sin(i / 6) * 3 + Math.sin(i / 2.3) * 1.2)
    return arr
  })
  const [activeId, setActiveId] = useState('t1')
  const [filter, setFilter] = useState<DashboardFilter>('overview')

  // Keep current rates in refs so the RAF loop accumulates without re-subscribing.
  const downRateRef = useRef(downRate)
  const upRateRef = useRef(upRate)
  downRateRef.current = downRate
  upRateRef.current = upRate

  useEffect(() => {
    if (reducedMotion) return
    let raf = 0
    let lastTick = performance.now()
    let lastSlowTick = performance.now()

    const loop = (now: number) => {
      const dt = (now - lastTick) / 1000
      lastTick = now

      setHistory((h) => {
        const last = h[h.length - 1]
        const phase = now / 1000
        const target = 14 + Math.sin(phase / 4.5) * 4 + Math.sin(phase / 1.7) * 1.4
        const noise = (Math.random() - 0.5) * 0.6
        const next = last + (target - last) * 0.18 + noise
        const out = h.slice(1)
        out.push(Math.max(2, Math.min(28, next)))
        return out
      })

      setElapsed((e) => e + dt)
      setDownloadedMB((d) => d + (downRateRef.current * dt) / 1.5)
      setUploadedMB((u) => u + (upRateRef.current * dt) / 1.5)

      if (now - lastSlowTick > 950) {
        lastSlowTick = now
        const phase = now / 1000
        const d = 13 + Math.sin(phase / 3.2) * 3 + (Math.random() - 0.5) * 1.2
        const u = 9.5 + Math.sin(phase / 4.1 + 1) * 1.6 + (Math.random() - 0.5) * 0.8
        setDownRate(+d.toFixed(1))
        setUpRate(+u.toFixed(1))

        setTorrents((ts) =>
          ts.map((t) => {
            if (t.status !== 'dl') return t
            const inc = (0.012 + Math.random() * 0.014) * (t.id === 't1' ? 0.7 : 1.2)
            const p = Math.min(1, t.progress + inc)
            if (p >= 1) return { ...t, progress: 1, status: 'se', totalSec: null, peers: t.peers + 2 }
            const remaining = t.totalSec != null ? Math.max(0, t.totalSec - 1) : null
            return { ...t, progress: p, totalSec: remaining }
          }),
        )
      }

      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [reducedMotion])

  const counts = useMemo(() => {
    const dl = torrents.filter((t) => t.status === 'dl').length
    const se = torrents.filter((t) => t.status === 'se').length
    // +144 is mock flavor so the "Completed" badge reads like a real library.
    return { ov: torrents.length, dl, se, done: torrents.filter((t) => t.progress >= 1).length + 144 }
  }, [torrents])

  return {
    torrents,
    downRate,
    upRate,
    elapsed,
    downloadedMB,
    uploadedMB,
    history,
    activeId,
    setActiveId,
    filter,
    setFilter,
    counts,
    reducedMotion,
  }
}
