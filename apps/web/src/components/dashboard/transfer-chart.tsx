'use client'

import { useId } from 'react'

import { smoothPath } from '@/components/ui/sparkline'

export type TransferChartProps = {
  history: number[]
  downRate: number
  mode?: 'download' | 'upload'
  /** Set false (reduced motion) to drop the pulsing-tip SMIL animation. */
  animateTip?: boolean
}

// Area chart with gradient fill + a glowing, pulsing tip. Colors come from
// tokens via hsl(var(--token)) (SVG stops can't take Tailwind classes): cyan
// for download, violet for upload, orange when download speed is low.
export function TransferChart({ history, downRate, mode = 'download', animateTip = true }: TransferChartProps) {
  const uid = useId()
  const W = 480
  const H = 160
  const padX = 12
  const padY = 18
  // Scale the y-axis to the data instead of a fixed MB/s ceiling, so real
  // self-hosted rates (often B/s–KB/s ≈ a tiny fraction of an MB/s) fill the
  // chart instead of flat-lining at the bottom. Headroom keeps the peak off
  // the very top edge; the `|| 1` guards an all-zero history from dividing by 0.
  const min = 0
  const dataMax = history.length ? Math.max(...history) : 0
  const max = dataMax > 0 ? dataMax * 1.15 : 1

  const pts = history.map((v, i) => ({
    x: padX + (i / Math.max(1, history.length - 1)) * (W - padX * 2),
    y: padY + (1 - (v - min) / (max - min)) * (H - padY * 2),
  }))
  if (pts.length < 2) return null

  const d = smoothPath(pts)
  const last = pts[pts.length - 1]

  const base = mode === 'upload' ? 'hsl(var(--chart-upload))' : 'hsl(var(--info))'
  const lowSpeed = mode === 'download' && dataMax > 0 && downRate < dataMax * 0.3
  const tipColor = lowSpeed ? 'hsl(var(--warning))' : base
  const areaPath = `${d} L ${last.x} ${H - padY} L ${pts[0].x} ${H - padY} Z`

  const areaId = `area-${uid}`
  const lineId = `line-${uid}`
  const glowId = `glow-${uid}`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-full w-full" aria-hidden="true">
      <defs>
        <linearGradient id={areaId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={base} stopOpacity="0.3" />
          <stop offset="100%" stopColor={base} stopOpacity="0" />
        </linearGradient>
        <linearGradient id={lineId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={base} />
          <stop offset="80%" stopColor={base} />
          <stop offset="100%" stopColor={tipColor} />
        </linearGradient>
        <radialGradient id={glowId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={tipColor} stopOpacity="0.65" />
          <stop offset="100%" stopColor={tipColor} stopOpacity="0" />
        </radialGradient>
      </defs>

      {[0, 1, 2, 3].map((i) => {
        const y = padY + (i / 3) * (H - padY * 2)
        return <line key={i} x1={padX} x2={W - padX} y1={y} y2={y} stroke="hsl(var(--foreground) / 0.04)" strokeWidth="1" />
      })}

      <path d={areaPath} fill={`url(#${areaId})`} />
      <path d={d} stroke={`url(#${lineId})`} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last.x} cy={last.y} r="18" fill={`url(#${glowId})`} />
      <circle cx={last.x} cy={last.y} r="3.5" fill={tipColor} />
      <circle cx={last.x} cy={last.y} r="3.5" fill="none" stroke={tipColor} strokeOpacity="0.5" strokeWidth="2">
        {animateTip && (
          <>
            <animate attributeName="r" values="3.5;7;3.5" dur="1.6s" repeatCount="indefinite" />
            <animate attributeName="stroke-opacity" values="0.5;0;0.5" dur="1.6s" repeatCount="indefinite" />
          </>
        )}
      </circle>
    </svg>
  )
}
