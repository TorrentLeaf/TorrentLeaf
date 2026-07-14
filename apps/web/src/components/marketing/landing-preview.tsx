'use client'

import { useEffect, useState } from 'react'

import { WindowChrome } from '@/components/dashboard/window-chrome'
import { Sidebar } from '@/components/dashboard/sidebar'
import { TorrentTable } from '@/components/dashboard/torrent-table'
import { TorrentCardList } from '@/components/dashboard/torrent-card-list'
import { TransferChart } from '@/components/dashboard/transfer-chart'
import { StatsPanel } from '@/components/dashboard/stats-panel'
import { PhonePreview } from '@/components/dashboard/phone-preview'
import { useAnimatedDashboard } from '@/hooks/use-animated-dashboard'
import { useViewport } from '@/hooks/use-viewport'
import { cn } from '@/lib/utils'

// Marketing preview: the SAME dashboard components as /library, fed by the
// animated MOCK loop (useAnimatedDashboard) — reduced + non-interactive (no
// navigation; toggles/filter are local). No duplicate dashboard version.
export function LandingPreview() {
  const dash = useAnimatedDashboard()
  const { isMobile, isTablet } = useViewport()
  const [notifications, setNotifications] = useState(false)
  const [darkTheme, setDarkTheme] = useState(true)
  const [chartMode, setChartMode] = useState<'download' | 'upload'>('download')
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // SSR + first client render show a deterministic skeleton (no animated SVG),
  // so React never has to hydrate the chart/sparkline float paths — which was
  // throwing a hydration mismatch. The real animated preview mounts client-side.
  if (!mounted) {
    return (
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-center xl:grid-cols-[minmax(0,1fr)_240px]">
        <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-border-strong bg-[linear-gradient(180deg,hsl(var(--surface)),hsl(var(--background)))] shadow-[0_1px_0_rgba(255,255,255,0.06)_inset,0_40px_80px_-20px_rgba(0,0,0,0.7),0_0_0_1px_rgba(0,0,0,0.5)]">
          <WindowChrome />
          <div className="min-h-[420px]" />
        </div>
        <div className="hidden lg:block" />
      </div>
    )
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-center xl:grid-cols-[minmax(0,1fr)_240px]">
      {/* Desktop app window */}
      <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-border-strong bg-[linear-gradient(180deg,hsl(var(--surface)),hsl(var(--background)))] shadow-[0_1px_0_rgba(255,255,255,0.06)_inset,0_40px_80px_-20px_rgba(0,0,0,0.7),0_0_0_1px_rgba(0,0,0,0.5)]">
        <WindowChrome />
        <div className="grid grid-cols-1 md:grid-cols-[60px_1fr] lg:grid-cols-[200px_1fr]">
          {!isMobile && (
            <Sidebar
              counts={dash.counts}
              filter={dash.filter}
              onFilterChange={dash.setFilter}
              libraryCounts={{ comics: 0, books: 0, pdfs: 0, video: 0, other: 0 }}
              onLibraryFormat={() => {}}
              notifications={notifications}
              onNotificationsChange={setNotifications}
              darkTheme={darkTheme}
              onDarkThemeChange={setDarkTheme}
              collapsed={isTablet}
            />
          )}
          <main className="flex min-w-0 flex-col">
            {isMobile ? (
              <TorrentCardList
                torrents={dash.torrents}
                activeId={dash.activeId}
                onActiveChange={dash.setActiveId}
                filter={dash.filter}
                history={dash.history}
              />
            ) : (
              <TorrentTable
                torrents={dash.torrents}
                activeId={dash.activeId}
                onActiveChange={dash.setActiveId}
                filter={dash.filter}
                compact
              />
            )}

            <div className="grid min-w-0 grid-cols-1 border-t border-border lg:grid-cols-[1.4fr_1fr]">
              <div className="flex min-h-[200px] min-w-0 flex-col border-b border-border px-5 py-4 lg:border-b-0 lg:border-r">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground-subtle">
                    Transfer speed
                  </span>
                  <div className="flex gap-0.5 rounded-sm border border-border bg-foreground/[0.03] p-0.5">
                    {(['download', 'upload'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setChartMode(m)}
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
                <div className="relative min-h-[160px] flex-1 overflow-hidden rounded-md border border-border bg-[linear-gradient(180deg,hsl(var(--info)/0.04),transparent)]">
                  <TransferChart
                    history={dash.history}
                    downRate={dash.downRate}
                    mode={chartMode}
                    animateTip={!dash.reducedMotion}
                  />
                </div>
              </div>
              <StatsPanel
                downRate={dash.downRate}
                upRate={dash.upRate}
                downloadedMB={dash.downloadedMB}
                uploadedMB={dash.uploadedMB}
                elapsed={dash.elapsed}
                torrents={dash.torrents}
              />
            </div>
          </main>
        </div>
      </div>

      {/* Phone mock — lg+ only */}
      <div className="hidden lg:block">
        <PhonePreview torrents={dash.torrents} history={dash.history} />
      </div>
    </div>
  )
}
