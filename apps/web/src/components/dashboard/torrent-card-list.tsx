'use client'

import { useMemo } from 'react'

import { Progress } from '@/components/ui/progress'
import { Sparkline } from '@/components/ui/sparkline'
import { StatusIcon } from '@/components/dashboard/status-icon'
import {
  applyFilter,
  timeLeftLabel,
  type DashboardFilter,
  type DashboardTorrent,
  type TorrentStatus,
} from '@/lib/dashboard'
import { cn } from '@/lib/utils'

export type TorrentCardListProps = {
  torrents: DashboardTorrent[]
  activeId?: string
  onActiveChange?: (id: string) => void
  filter: DashboardFilter
  /** Shared transfer history; each card derives a phase-shifted spark from it. */
  history: number[]
  /** Show only Peers (real data has no seeds). */
  hideSeeds?: boolean
}

const PROGRESS_VARIANT = { dl: 'info', se: 'success', pa: 'muted' } as const
const SPARK_COLOR: Record<TorrentStatus, string> = {
  dl: 'text-info',
  se: 'text-success',
  pa: 'text-foreground-subtle',
}
const typeTag =
  'flex-shrink-0 rounded-sm bg-foreground/[0.06] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground'

export function TorrentCardList({ torrents, activeId, onActiveChange, filter, history, hideSeeds }: TorrentCardListProps) {
  const rows = useMemo(() => applyFilter(torrents, filter), [torrents, filter])
  return (
    <div className="flex flex-col gap-2.5 p-3">
      {rows.map((t, i) => {
        const spark = history.slice(-20).map((v, k) => v + Math.sin(k / 3 + i) * 1.2)
        const active = t.id === activeId
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onActiveChange?.(t.id)}
            className={cn(
              'flex flex-col gap-[9px] rounded-lg border border-border p-3 pb-3.5 text-left transition-colors',
              'bg-[linear-gradient(180deg,hsl(var(--foreground)/0.025),hsl(var(--foreground)/0.01))]',
              'hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active &&
                'border-accent/25 bg-[linear-gradient(180deg,hsl(var(--accent)/0.08),hsl(var(--accent)/0.02))]',
            )}
          >
            <div className="flex min-w-0 items-center gap-2">
              <StatusIcon status={t.status} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{t.name}</span>
              {t.type ? <span className={typeTag}>{t.type}</span> : null}
            </div>

            <div className="flex items-center gap-2.5">
              <Progress
                value={t.progress * 100}
                variant={PROGRESS_VARIANT[t.status]}
                className="h-2 flex-1 bg-foreground/[0.06]"
              />
              <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {Math.round(t.progress * 100)}%
              </span>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="flex gap-4 text-xs tabular-nums text-foreground">
                <span>
                  <span className="mr-1 text-[11px] uppercase tracking-[0.08em] text-foreground-subtle">Size</span>
                  {t.size}
                </span>
                <span>
                  <span className="mr-1 text-[11px] uppercase tracking-[0.08em] text-foreground-subtle">Left</span>
                  {timeLeftLabel(t)}
                </span>
                <span>
                  <span className="mr-1 text-[11px] uppercase tracking-[0.08em] text-foreground-subtle">
                    {hideSeeds ? 'Peers' : 'S/P'}
                  </span>
                  {hideSeeds ? t.peers : `${t.seeds}/${t.peers}`}
                </span>
              </div>
              <Sparkline data={spark} width={90} height={24} className={cn('h-6 w-[90px] flex-shrink-0', SPARK_COLOR[t.status])} />
            </div>
          </button>
        )
      })}
    </div>
  )
}
