import * as React from 'react'
import { cn } from '@/lib/utils'

// Catmull-Rom-ish smoothing, ported verbatim from design components.reference.jsx
// (smoothPath). Exported so stage-05 widgets can reuse the same math.
export function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return ''
  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] || p2
    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`
  }
  return d
}

export type SparklineProps = {
  /** Raw series; min/max are auto-normalized into the viewBox. */
  data: number[]
  /** Intrinsic viewBox size (also the aspect ratio); the svg scales to its box. */
  width?: number
  height?: number
  strokeWidth?: number
  /** Draw the trailing dot at the last point. */
  showDot?: boolean
  /**
   * Color is inherited via `currentColor` — set it from a token utility on the
   * parent or via className (e.g. `text-info`, `text-success`). No hex props.
   */
  className?: string
}

// Inline SVG line + trailing dot. Used by the mobile torrent cards and the
// phone preview. Stroke uses currentColor so the caller picks a token color.
export function Sparkline({
  data,
  width = 110,
  height = 26,
  strokeWidth = 1.2,
  showDot = true,
  className,
}: SparklineProps) {
  const pad = 2
  if (data.length < 2) return null
  const mn = Math.min(...data)
  const mx = Math.max(...data)
  const pts = data.map((v, k) => ({
    x: pad + (k / (data.length - 1)) * (width - pad * 2),
    y: pad + (1 - (v - mn) / Math.max(0.01, mx - mn)) * (height - pad * 2),
  }))
  const last = pts[pts.length - 1]
  return (
    <svg
      className={cn('text-info', className)}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        d={smoothPath(pts)}
        stroke="currentColor"
        strokeWidth={strokeWidth}
        fill="none"
        strokeLinecap="round"
      />
      {showDot && <circle cx={last.x} cy={last.y} r="1.8" fill="currentColor" />}
    </svg>
  )
}
