'use client'

import { TorrentTable } from '@/components/dashboard/torrent-table'
import { TorrentCardList } from '@/components/dashboard/torrent-card-list'
import { TransferChart } from '@/components/dashboard/transfer-chart'
import { StatsPanel, type StatCell } from '@/components/dashboard/stats-panel'
import { AppShell } from '@/components/dashboard/app-shell'
import { useViewport } from '@/hooks/use-viewport'
import type { DashboardCounts, DashboardFilter, DashboardTorrent } from '@/lib/dashboard'
import type { LibraryFormat } from '@/lib/library-format'
import { cn } from '@/lib/utils'

export type ChartMode = 'download' | 'upload'

export type DashboardShellProps = {
  torrents: DashboardTorrent[]
  counts: DashboardCounts
  filter: DashboardFilter
  onFilterChange: (f: DashboardFilter) => void
  libraryCounts: Record<LibraryFormat, number>
  activeFormat?: LibraryFormat
  onLibraryFormat: (format: LibraryFormat) => void
  activeId?: string
  onActiveChange?: (id: string) => void
  history: number[]
  downRate: number
  upRate: number
  stats?: StatCell[]
  chartMode: ChartMode
  onChartModeChange: (m: ChartMode) => void
  notifications: boolean
  onNotificationsChange: (v: boolean) => void
  darkTheme: boolean
  onDarkThemeChange: (v: boolean) => void
  onAdd?: () => void
  onSettings?: () => void
  hideSeeds?: boolean
  animateTip?: boolean
}

// The /library dashboard: the shared AppShell frame + a transfers main area
// (table/cards + chart + stats).
export function DashboardShell(props: DashboardShellProps) {
  const {
    torrents, counts, filter, onFilterChange, libraryCounts, activeFormat, onLibraryFormat,
    activeId, onActiveChange, history,
    downRate, upRate, stats, chartMode, onChartModeChange,
    notifications, onNotificationsChange, darkTheme, onDarkThemeChange,
    onAdd, onSettings, hideSeeds, animateTip = true,
  } = props
  const { isMobile, isTablet } = useViewport()

  return (
    <AppShell
      counts={counts}
      activeFilter={filter}
      onFilterChange={onFilterChange}
      libraryCounts={libraryCounts}
      activeFormat={activeFormat}
      onLibraryFormat={onLibraryFormat}
      onAdd={onAdd}
      onSettings={onSettings}
      notifications={notifications}
      onNotificationsChange={onNotificationsChange}
      darkTheme={darkTheme}
      onDarkThemeChange={onDarkThemeChange}
    >
      {isMobile ? (
        <TorrentCardList
          torrents={torrents}
          activeId={activeId}
          onActiveChange={onActiveChange}
          filter={filter}
          history={history}
          hideSeeds={hideSeeds}
        />
      ) : (
        <TorrentTable
          torrents={torrents}
          activeId={activeId}
          onActiveChange={onActiveChange}
          filter={filter}
          compact={isTablet}
          hideSeeds={hideSeeds}
        />
      )}

      <div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 border-t border-border lg:grid-cols-[1.4fr_1fr]">
        <div className="flex min-h-[240px] min-w-0 flex-col border-b border-border px-5 py-4 lg:border-b-0 lg:border-r">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground-subtle">Transfer speed</span>
            <div className="flex gap-0.5 rounded-sm border border-border bg-foreground/[0.03] p-0.5">
              {(['download', 'upload'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => onChartModeChange(m)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em]',
                    chartMode === m ? 'bg-foreground/[0.06] text-foreground' : 'text-muted-foreground',
                  )}
                >
                  <span className={cn('h-2.5 w-2.5 rounded-[2px]', m === 'download' ? 'bg-info' : 'bg-chart-upload')} />
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div className="relative min-h-[180px] flex-1 overflow-hidden rounded-md border border-border bg-[linear-gradient(180deg,hsl(var(--info)/0.04),transparent)]">
            <TransferChart history={history} downRate={downRate} mode={chartMode} animateTip={animateTip} />
          </div>
        </div>
        <StatsPanel downRate={downRate} upRate={upRate} stats={stats} torrents={torrents} />
      </div>
    </AppShell>
  )
}
