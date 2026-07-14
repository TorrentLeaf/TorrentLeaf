'use client'

import { useState, type ReactNode } from 'react'
import { Menu, Home, ArrowDown, ArrowUp, ListChecks } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { Drawer, DrawerContent, DrawerTrigger, DrawerTitle } from '@/components/ui/drawer'
import { Button } from '@/components/ui/button'
import { WindowChrome } from '@/components/dashboard/window-chrome'
import { Sidebar } from '@/components/dashboard/sidebar'
import { UserMenu } from '@/components/layout/user-menu'
import { useViewport } from '@/hooks/use-viewport'
import type { DashboardCounts, DashboardFilter } from '@/lib/dashboard'
import type { LibraryFormat } from '@/lib/library-format'
import { cn } from '@/lib/utils'

// The shared app window frame: full-bleed surface, WindowChrome (brand + login),
// Sidebar (desktop/tablet), mobile drawer + bottom nav. The page supplies the
// main content via `children`. Used by the /library dashboard and the
// /torrents · /settings pages so they all share one window chrome.
export type AppShellProps = {
  counts: DashboardCounts
  /** Highlighted nav item (e.g. the active filter on /library); omit for none. */
  activeFilter?: DashboardFilter
  /** Highlight the Settings nav item (on /settings). */
  settingsActive?: boolean
  onFilterChange: (f: DashboardFilter) => void
  libraryCounts: Record<LibraryFormat, number>
  activeFormat?: LibraryFormat
  onLibraryFormat: (format: LibraryFormat) => void
  onAdd?: () => void
  onSettings?: () => void
  notifications: boolean
  onNotificationsChange: (v: boolean) => void
  darkTheme: boolean
  onDarkThemeChange: (v: boolean) => void
  children: ReactNode
}

const BOTTOM_NAV: { id: DashboardFilter; label: string; icon: LucideIcon; badge: keyof DashboardCounts | null }[] = [
  { id: 'overview', label: 'Overview', icon: Home, badge: 'ov' },
  { id: 'downloading', label: 'Down', icon: ArrowDown, badge: 'dl' },
  { id: 'seeding', label: 'Seed', icon: ArrowUp, badge: 'se' },
  { id: 'completed', label: 'Done', icon: ListChecks, badge: null },
]

export function AppShell({
  counts,
  activeFilter,
  settingsActive,
  onFilterChange,
  libraryCounts,
  activeFormat,
  onLibraryFormat,
  onAdd,
  onSettings,
  notifications,
  onNotificationsChange,
  darkTheme,
  onDarkThemeChange,
  children,
}: AppShellProps) {
  const { isMobile, isTablet } = useViewport()
  const [menuOpen, setMenuOpen] = useState(false)

  const sidebarProps = {
    counts,
    filter: activeFilter,
    settingsActive,
    libraryCounts,
    activeFormat,
    onLibraryFormat,
    notifications,
    onNotificationsChange,
    darkTheme,
    onDarkThemeChange,
    onAdd,
    onSettings,
  }

  return (
    <div
      className={cn(
        'flex min-h-screen flex-col bg-[linear-gradient(180deg,hsl(var(--surface)),hsl(var(--background)))]',
        isMobile && 'pb-16', // room for the fixed bottom nav
      )}
    >
      {/* Title bar — hamburger (mobile) opens the full sidebar drawer */}
      <div className="flex items-center">
        {isMobile && (
          <Drawer direction="right" open={menuOpen} onOpenChange={setMenuOpen}>
            <DrawerTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open menu" className="ml-1 h-8 w-8 flex-shrink-0">
                <Menu className="h-4 w-4" />
              </Button>
            </DrawerTrigger>
            <DrawerContent side="right" className="overflow-y-auto p-0">
              <DrawerTitle className="sr-only">Menu</DrawerTitle>
              <Sidebar
                {...sidebarProps}
                onFilterChange={(f) => {
                  onFilterChange(f)
                  setMenuOpen(false)
                }}
                onAdd={onAdd ? () => { onAdd(); setMenuOpen(false) } : undefined}
                onSettings={onSettings ? () => { onSettings(); setMenuOpen(false) } : undefined}
              />
            </DrawerContent>
          </Drawer>
        )}
        <div className="min-w-0 flex-1">
          <WindowChrome chromeless={isMobile} trailing={<UserMenu />} />
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[64px_1fr] lg:grid-cols-[230px_1fr]">
        {!isMobile && <Sidebar {...sidebarProps} onFilterChange={onFilterChange} collapsed={isTablet} />}
        <main className="flex min-h-0 min-w-0 flex-col">{children}</main>
      </div>

      {/* Mobile bottom nav */}
      {isMobile && (
        <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-surface md:hidden">
          {BOTTOM_NAV.map((it) => {
            const active = activeFilter === it.id
            const Icon = it.icon
            return (
              <button
                key={it.id}
                type="button"
                onClick={() => onFilterChange(it.id)}
                className={cn(
                  'flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px]',
                  active ? 'text-accent' : 'text-muted-foreground',
                )}
              >
                <span className="relative">
                  <Icon className="h-[18px] w-[18px]" />
                  {it.badge != null && counts[it.badge] > 0 && (
                    <span className="absolute -right-2.5 -top-1.5 rounded-full bg-accent/[0.18] px-1 text-[9px] tabular-nums text-accent">
                      {counts[it.badge]}
                    </span>
                  )}
                </span>
                {it.label}
              </button>
            )
          })}
        </nav>
      )}
    </div>
  )
}
