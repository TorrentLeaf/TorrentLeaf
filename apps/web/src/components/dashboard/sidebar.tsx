'use client'

import { Fragment } from 'react'
import {
  Home,
  ArrowDown,
  ArrowUp,
  ListChecks,
  Settings,
  Plus,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { ThemeToggle } from '@/components/dashboard/theme-toggle'
import type { DashboardCounts, DashboardFilter } from '@/lib/dashboard'
import { LIBRARY_FORMATS, type LibraryFormat } from '@/lib/library-format'
import { cn } from '@/lib/utils'

export type SidebarProps = {
  counts: DashboardCounts
  /** Which nav item is highlighted; omit for none (e.g. on /settings). */
  filter?: DashboardFilter
  /** Highlight the Settings item (used on the /settings route). */
  settingsActive?: boolean
  onFilterChange: (filter: DashboardFilter) => void
  /** Per-format library card counts, shown as badges on the Library section. */
  libraryCounts: Record<LibraryFormat, number>
  /** Highlighted library format (on /library?format=…); omit for none. */
  activeFormat?: LibraryFormat
  onLibraryFormat: (format: LibraryFormat) => void
  /** Icon-rail mode (tablet). */
  collapsed?: boolean
  /** Primary "Add torrent" action — rendered in the Overview section. */
  onAdd?: () => void
  /** Navigate to settings (the top navbar is hidden on the dashboard). */
  onSettings?: () => void
  className?: string
}

const NAV: { id: DashboardFilter; label: string; icon: LucideIcon; badge: keyof DashboardCounts }[] = [
  { id: 'overview', label: 'Overview', icon: Home, badge: 'ov' },
  { id: 'downloading', label: 'Downloading', icon: ArrowDown, badge: 'dl' },
  { id: 'seeding', label: 'Seeding', icon: ArrowUp, badge: 'se' },
  { id: 'completed', label: 'Completed', icon: ListChecks, badge: 'done' },
]

const sectionLabel = 'px-2 pb-1.5 pt-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground-subtle first:pt-1'
const itemBase =
  'flex w-full items-center gap-3 rounded-md border border-transparent px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-foreground/[0.03] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset'
const itemActive =
  'border-accent/15 bg-[linear-gradient(180deg,hsl(var(--accent)/0.10),hsl(var(--accent)/0.04))] text-foreground'

export function Sidebar({
  counts,
  filter,
  settingsActive,
  onFilterChange,
  libraryCounts,
  activeFormat,
  onLibraryFormat,
  collapsed = false,
  onAdd,
  onSettings,
  className,
}: SidebarProps) {
  return (
    <aside
      className={cn(
        'flex flex-col gap-1 overflow-hidden border-r border-border',
        collapsed ? 'px-2 py-4' : 'px-3 py-4',
        className,
      )}
    >
      <div className={cn(sectionLabel, collapsed && 'hidden')}>Overview</div>
      {NAV.map(({ id, label, icon: Icon, badge }) => {
        const active = filter === id
        return (
          <Fragment key={id}>
            <button
              type="button"
              title={label}
              aria-current={active ? 'page' : undefined}
              onClick={() => onFilterChange(id)}
              className={cn(itemBase, active && itemActive, collapsed && 'justify-center px-0 py-[9px]')}
            >
              <Icon className="h-4 w-4 flex-shrink-0 opacity-80" />
              <span className={cn('min-w-0 flex-1 truncate', collapsed && 'hidden')}>{label}</span>
              <span
                className={cn(
                  'min-w-[18px] rounded-sm px-[7px] py-px text-center text-[11px] tabular-nums',
                  active ? 'bg-accent/[0.18] text-accent' : 'bg-foreground/[0.04] text-foreground-subtle',
                  collapsed && 'hidden',
                )}
              >
                {counts[badge]}
              </span>
            </button>
            {/* Add sits between Overview and Downloading */}
            {id === 'overview' && onAdd && (
              <button
                type="button"
                title="Add torrent"
                onClick={onAdd}
                className={cn(
                  itemBase,
                  'border-accent/30 bg-accent/[0.06] text-accent hover:bg-accent/10 hover:text-accent',
                  collapsed && 'justify-center px-0 py-[9px]',
                )}
              >
                <Plus className="h-4 w-4 flex-shrink-0" />
                <span className={cn('min-w-0 flex-1 truncate font-medium', collapsed && 'hidden')}>Add</span>
              </button>
            )}
          </Fragment>
        )
      })}

      <div className={cn(sectionLabel, collapsed && 'hidden')}>Library</div>
      {LIBRARY_FORMATS.map(({ id, label, icon: Icon }) => {
        const active = activeFormat === id
        return (
          <button
            key={id}
            type="button"
            title={label}
            aria-current={active ? 'page' : undefined}
            onClick={() => onLibraryFormat(id)}
            className={cn(itemBase, active && itemActive, collapsed && 'justify-center px-0 py-[9px]')}
          >
            <Icon className="h-4 w-4 flex-shrink-0 opacity-80" />
            <span className={cn('min-w-0 flex-1 truncate', collapsed && 'hidden')}>{label}</span>
            <span
              className={cn(
                'min-w-[18px] rounded-sm px-[7px] py-px text-center text-[11px] tabular-nums',
                active ? 'bg-accent/[0.18] text-accent' : 'bg-foreground/[0.04] text-foreground-subtle',
                collapsed && 'hidden',
              )}
            >
              {libraryCounts[id]}
            </span>
          </button>
        )
      })}

      <div className={cn(sectionLabel, collapsed && 'hidden')}>Settings</div>
      <button
        type="button"
        title="Settings"
        aria-current={settingsActive ? 'page' : undefined}
        onClick={onSettings}
        className={cn(itemBase, settingsActive && itemActive, collapsed && 'justify-center px-0 py-[9px]')}
      >
        <Settings className="h-4 w-4 flex-shrink-0 opacity-80" />
        <span className={cn('min-w-0 flex-1 truncate', collapsed && 'hidden')}>Settings</span>
      </button>
      <ThemeToggle collapsed={collapsed} />
    </aside>
  )
}
