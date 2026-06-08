import { Menu, Search, MoreHorizontal, ArrowDownUp, BookOpen, Settings } from 'lucide-react'

import { Sparkline } from '@/components/ui/sparkline'
import type { DashboardTorrent, TorrentStatus } from '@/lib/dashboard'
import { cn } from '@/lib/utils'

const SPARK_COLOR: Record<TorrentStatus, string> = {
  dl: 'text-info',
  se: 'text-success',
  pa: 'text-muted-foreground',
}

// Compact phone mock shown on the landing (lg+). Presentational; reuses the
// shared Sparkline so it stays in sync with the rest of the dashboard.
export function PhonePreview({ torrents, history }: { torrents: DashboardTorrent[]; history: number[] }) {
  const items = torrents.slice(0, 4)
  return (
    <div
      className="flex h-full flex-col gap-2.5 overflow-hidden rounded-[28px] border border-border-strong p-[14px_12px] bg-[linear-gradient(180deg,hsl(var(--surface)),hsl(var(--background)))] shadow-[0_1px_0_rgba(255,255,255,0.05)_inset,0_30px_60px_-15px_rgba(0,0,0,0.7),0_0_0_1px_rgba(0,0,0,0.5)]"
      aria-hidden="true"
    >
      <div className="flex items-center justify-between px-1 pt-1 text-[13px] font-semibold text-foreground">
        <span className="flex items-center gap-1.5">
          <Menu className="h-3.5 w-3.5" /> Library
        </span>
        <span className="flex gap-1.5 text-muted-foreground">
          <Search className="h-3.5 w-3.5" />
          <MoreHorizontal className="h-3.5 w-3.5" />
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2 overflow-hidden">
        {items.map((t, i) => {
          const spark = history.slice(-24).map((v, k) => v + Math.sin(k / 3 + i) * 1.5)
          return (
            <div
              key={t.id}
              className={cn(
                'flex flex-col gap-1.5 rounded-lg border border-border bg-foreground/[0.025] p-2.5',
                i === 0 && 'border-accent/25 bg-[linear-gradient(180deg,hsl(var(--accent)/0.08),hsl(var(--accent)/0.02))]',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="grid h-4 w-4 flex-shrink-0 place-items-center rounded-sm bg-accent/[0.18] text-[9px] font-bold text-accent">
                    {t.type[0]}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[9.5px] text-foreground">{t.name.split('·')[0].trim()}</span>
                </div>
                <span className="text-[9.5px] tabular-nums text-foreground">{Math.round(t.progress * 100)}%</span>
              </div>
              <Sparkline data={spark} width={70} height={22} className={cn('h-[26px] w-full', SPARK_COLOR[t.status])} />
              <span className="text-[9px] text-foreground-subtle">{t.size}</span>
            </div>
          )
        })}
      </div>

      <div className="flex justify-around border-t border-border pb-1 pt-2 text-foreground-subtle">
        <span className="p-1 text-accent">
          <ArrowDownUp className="h-3.5 w-3.5" />
        </span>
        <span className="p-1">
          <BookOpen className="h-3.5 w-3.5" />
        </span>
        <span className="p-1">
          <Settings className="h-3.5 w-3.5" />
        </span>
      </div>
    </div>
  )
}
