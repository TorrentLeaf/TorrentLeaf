import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { AppShell } from './app-shell'
import { DashboardShell } from './dashboard-shell'
import { AppPageShell } from './app-page-shell'
import type { DashboardTorrent } from '@/lib/dashboard'
import type { LibraryFormat } from '@/lib/library-format'

// next/navigation is not available under jsdom; stub the router.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

const counts = { ov: 2, dl: 1, se: 1, done: 0 }
const libraryCounts: Record<LibraryFormat, number> = { comics: 1, books: 0, pdfs: 0, video: 0, other: 0 }
const torrents: DashboardTorrent[] = [
  { id: 'a', name: 'Alpha', type: 'CBZ', size: '1 GB', totalSec: 30, peers: 3, seeds: 5, progress: 0.4, status: 'dl' },
]

describe('AppShell', () => {
  it('renders the sidebar and children', () => {
    render(
      <AppShell
        counts={counts}
        onFilterChange={vi.fn()}
        libraryCounts={libraryCounts}
        onLibraryFormat={vi.fn()}
      >
        <div>Page body</div>
      </AppShell>,
    )
    expect(screen.getByText('Page body')).toBeInTheDocument()
    expect(screen.getAllByText('Overview').length).toBeGreaterThan(0)
  })
})

describe('DashboardShell', () => {
  it('renders the transfers table + stats', () => {
    render(
      <DashboardShell
        torrents={torrents}
        counts={counts}
        filter="overview"
        onFilterChange={vi.fn()}
        libraryCounts={libraryCounts}
        onLibraryFormat={vi.fn()}
        history={[1, 2, 3]}
        downRate={1.2}
        upRate={0.3}
        chartMode="download"
        onChartModeChange={vi.fn()}
      />,
    )
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText(/Transfer speed/i)).toBeInTheDocument()
  })
})

describe('AppPageShell', () => {
  it('renders children inside the shell with a live query', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <AppPageShell settingsActive>
          <div>Settings content</div>
        </AppPageShell>
      </QueryClientProvider>,
    )
    expect(screen.getByText('Settings content')).toBeInTheDocument()
  })
})
