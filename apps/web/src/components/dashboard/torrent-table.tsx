'use client'

import { useMemo } from 'react'

import { Progress } from '@/components/ui/progress'
import { StatusIcon } from '@/components/dashboard/status-icon'
import {
  applyFilter,
  timeLeftLabel,
  type DashboardFilter,
  type DashboardTorrent,
} from '@/lib/dashboard'
import { cn } from '@/lib/utils'

export type TorrentTableProps = {
  torrents: DashboardTorrent[]
  activeId?: string
  onActiveChange?: (id: string) => void
  filter: DashboardFilter
  /** Tighter padding/typography for the tablet rail layout. */
  compact?: boolean
  /** Hide the Seeds column (real data has only a peer count, no seeds). */
  hideSeeds?: boolean
}

const PROGRESS_VARIANT = { dl: 'info', se: 'success', pa: 'muted' } as const
const th =
  'border-b border-border px-3 pb-3 pt-3.5 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-foreground-subtle whitespace-nowrap'
const td = 'px-3 py-3.5 text-sm text-foreground tabular-nums'
const typeTag =
  'inline-flex rounded-sm bg-foreground/[0.06] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground'

export function TorrentTable({ torrents, activeId, onActiveChange, filter, compact, hideSeeds }: TorrentTableProps) {
  const rows = useMemo(() => applyFilter(torrents, filter), [torrents, filter])
  return (
    <div className={cn('overflow-x-auto', compact ? 'px-3 pt-3' : 'px-5 pt-4')}>
      <table className={cn('w-full border-collapse', compact ? 'text-[13px]' : 'text-sm')}>
        <thead>
          <tr>
            <th className={th}>Name</th>
            <th className={th}>Type</th>
            <th className={th}>Progress</th>
            <th className={th}>Size</th>
            <th className={th}>Time left</th>
            {!hideSeeds && <th className={th}>Seeds</th>}
            <th className={cn(th, 'hidden lg:table-cell')}>Peers</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => {
            const active = t.id === activeId
            const pct = Math.round(t.progress * 100)
            return (
              <tr
                key={t.id}
                onClick={() => onActiveChange?.(t.id)}
                className={cn(
                  'cursor-pointer border-b border-foreground/[0.04] transition-colors hover:bg-foreground/[0.03]',
                  active && 'bg-[linear-gradient(90deg,hsl(var(--accent)/0.06),transparent)]',
                )}
              >
                <td className={td}>
                  <div className="flex min-w-0 items-center gap-3">
                    <StatusIcon status={t.status} />
                    <span className="min-w-0 flex-1 truncate font-medium text-foreground" title={t.name}>
                      {t.name}
                    </span>
                  </div>
                </td>
                <td className={td}>{t.type ? <span className={typeTag}>{t.type}</span> : null}</td>
                <td className={cn(td, compact ? 'w-[140px]' : 'w-[200px]')}>
                  <div className="flex items-center gap-2.5">
                    <Progress
                      value={t.progress * 100}
                      variant={PROGRESS_VARIANT[t.status]}
                      className="h-2 flex-1 bg-foreground/[0.06]"
                    />
                    <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{pct}%</span>
                  </div>
                </td>
                <td className={cn(td, 'whitespace-nowrap text-muted-foreground')}>{t.size}</td>
                <td className={cn(td, 'whitespace-nowrap text-muted-foreground')}>{timeLeftLabel(t)}</td>
                {!hideSeeds && <td className={td}>{t.seeds}</td>}
                <td className={cn(td, 'hidden lg:table-cell')}>{t.peers}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
