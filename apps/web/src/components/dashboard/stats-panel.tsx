import { ArrowDown, ArrowUp } from 'lucide-react'

import { fmtElapsed, fmtMB, fmtTime, type DashboardTorrent } from '@/lib/dashboard'

export type StatCell = { label: string; value: string | number }

export type StatsPanelProps = {
  downRate: number
  upRate: number
  /** Real callers pass `stats` to control the grid. Omit it (landing mock) to
   * use the derived demo cells below. */
  stats?: StatCell[]
  downloadedMB?: number
  uploadedMB?: number
  elapsed?: number
  torrents?: DashboardTorrent[]
}

// Big ↓/↑ rates + a 2-col stat grid. All numbers use tabular-nums so they don't
// jitter while animating (stage 07).
export function StatsPanel({ downRate, upRate, stats, downloadedMB = 0, uploadedMB = 0, elapsed = 0, torrents = [] }: StatsPanelProps) {
  // Derived demo cells — only used when `stats` isn't supplied (landing mock).
  const activeSeeds = torrents.reduce((s, t) => s + (t.status !== 'pa' ? t.seeds : 0), 0)
  const ratio = downloadedMB > 0 ? (uploadedMB / downloadedMB).toFixed(2) : '0.00'
  const remainingMB = torrents.reduce((s, t) => (t.status === 'dl' ? s + 800 * (1 - t.progress) : s), 0)
  const timeLeftSec = downRate > 0 ? remainingMB / downRate : 0

  const cells: StatCell[] = stats ?? [
    { label: 'Seeds', value: activeSeeds },
    { label: 'Down / up ratio', value: ratio },
    { label: 'Downloaded', value: `${Math.round(downloadedMB)} MB` },
    { label: 'Uploaded', value: `${Math.round(uploadedMB)} MB` },
    { label: 'Time elapsed', value: fmtElapsed(elapsed) },
    { label: 'Time left', value: fmtTime(timeLeftSec) },
  ]

  return (
    <div className="flex min-w-0 flex-col gap-4 px-5 py-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground-subtle">
        Download / Upload per sec
      </div>

      <div className="mt-1 grid grid-cols-2 gap-3">
        <div className="flex items-baseline gap-2">
          <ArrowDown className="h-4 w-4 self-center text-info" strokeWidth={2.5} />
          <span className="text-[clamp(24px,2.6vw,30px)] font-semibold tabular-nums tracking-[-0.01em] text-foreground">
            {fmtMB(downRate)}
          </span>
          <span className="text-sm font-medium text-muted-foreground">MB/s</span>
        </div>
        <div className="flex items-baseline gap-2">
          <ArrowUp className="h-4 w-4 self-center text-chart-upload" strokeWidth={2.5} />
          <span className="text-[clamp(24px,2.6vw,30px)] font-semibold tabular-nums tracking-[-0.01em] text-foreground">
            {fmtMB(upRate)}
          </span>
          <span className="text-sm font-medium text-muted-foreground">MB/s</span>
        </div>
      </div>

      <div className="mt-1 grid grid-cols-2 gap-x-5 gap-y-4">
        {cells.map((c) => (
          <div key={c.label}>
            <div className="mb-1 text-[11px] uppercase tracking-[0.06em] text-foreground-subtle">{c.label}</div>
            <div className="text-base tabular-nums text-foreground">{c.value}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
