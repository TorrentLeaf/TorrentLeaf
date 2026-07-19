import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'

import { StatusIcon } from './status-icon'
import { StatsPanel } from './stats-panel'
import { WindowChrome } from './window-chrome'
import { TorrentTable } from './torrent-table'
import { TorrentCardList } from './torrent-card-list'
import { TransferChart } from './transfer-chart'
import { Sidebar } from './sidebar'
import type { DashboardTorrent } from '@/lib/dashboard'
import type { LibraryFormat } from '@/lib/library-format'

const torrents: DashboardTorrent[] = [
  { id: 'a', name: 'Alpha', type: 'CBZ', size: '1 GB', totalSec: 30, peers: 3, seeds: 5, progress: 0.4, status: 'dl' },
  { id: 'b', name: 'Beta', type: 'PDF', size: '2 MB', totalSec: null, peers: 1, seeds: 2, progress: 1, status: 'se' },
  { id: 'c', name: 'Gamma', type: 'EPUB', size: '3 MB', totalSec: null, peers: 0, seeds: 0, progress: 0.5, status: 'pa' },
]

describe('StatusIcon', () => {
  it('renders a disc for each status', () => {
    for (const s of ['dl', 'se', 'pa'] as const) {
      const { container } = render(<StatusIcon status={s} />)
      expect(container.querySelector('span')).toBeInTheDocument()
    }
  })
})

describe('StatsPanel', () => {
  it('renders explicit stat cells', () => {
    render(<StatsPanel downRate={1.5} upRate={0.5} stats={[{ label: 'Peers', value: 9 }]} />)
    expect(screen.getByText('Peers')).toBeInTheDocument()
    expect(screen.getByText('9')).toBeInTheDocument()
    expect(screen.getByText('1.5')).toBeInTheDocument()
  })
  it('falls back to derived demo cells without stats', () => {
    render(<StatsPanel downRate={2} upRate={1} downloadedMB={100} uploadedMB={50} torrents={torrents} />)
    expect(screen.getByText('Down / up ratio')).toBeInTheDocument()
  })
})

describe('WindowChrome', () => {
  it('shows traffic-light controls by default', () => {
    render(<WindowChrome />)
    expect(screen.getByLabelText('close')).toBeInTheDocument()
  })
  it('shows trailing content when provided', () => {
    render(<WindowChrome trailing={<span>Trailing</span>} />)
    expect(screen.getByText('Trailing')).toBeInTheDocument()
    expect(screen.queryByLabelText('close')).not.toBeInTheDocument()
  })
})

describe('TorrentTable', () => {
  it('renders filtered rows and fires onActiveChange', async () => {
    const onActiveChange = vi.fn()
    render(<TorrentTable torrents={torrents} filter="overview" onActiveChange={onActiveChange} hideSeeds />)
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    // Seeds column hidden
    expect(screen.queryByText('Seeds')).not.toBeInTheDocument()
    await userEvent.click(screen.getByText('Alpha'))
    expect(onActiveChange).toHaveBeenCalledWith('a')
  })
  it('applies the downloading filter', () => {
    render(<TorrentTable torrents={torrents} filter="downloading" />)
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.queryByText('Beta')).not.toBeInTheDocument()
  })
})

describe('TorrentCardList', () => {
  it('renders cards and reacts to a tap', async () => {
    const onActiveChange = vi.fn()
    render(<TorrentCardList torrents={torrents} filter="overview" history={[1, 2, 3]} onActiveChange={onActiveChange} />)
    expect(screen.getByText('Beta')).toBeInTheDocument()
    await userEvent.click(screen.getByText('Beta'))
    expect(onActiveChange).toHaveBeenCalledWith('b')
  })
})

describe('TransferChart', () => {
  it('renders an SVG without crashing', () => {
    const { container } = render(<TransferChart history={[1, 5, 10, 3]} downRate={5} animateTip={false} />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })
})

describe('Sidebar', () => {
  const counts = { ov: 3, dl: 1, se: 1, done: 1 }
  const libraryCounts: Record<LibraryFormat, number> = { comics: 2, books: 0, pdfs: 1, video: 0, other: 0 }

  it('renders nav + format sections and fires callbacks', async () => {
    const onFilterChange = vi.fn()
    const onLibraryFormat = vi.fn()
    render(
      <Sidebar
        counts={counts}
        filter="overview"
        onFilterChange={onFilterChange}
        libraryCounts={libraryCounts}
        onLibraryFormat={onLibraryFormat}
        onAdd={vi.fn()}
        onSettings={vi.fn()}
      />,
    )
    expect(screen.getByText('Downloading')).toBeInTheDocument()
    expect(screen.getByText('Comics')).toBeInTheDocument()

    await userEvent.click(screen.getByText('Seeding'))
    expect(onFilterChange).toHaveBeenCalledWith('seeding')

    await userEvent.click(screen.getByText('Comics'))
    expect(onLibraryFormat).toHaveBeenCalledWith('comics')
  })
})
