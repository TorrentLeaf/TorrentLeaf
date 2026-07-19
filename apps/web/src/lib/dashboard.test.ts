import { describe, it, expect } from 'vitest'
import {
  fmtTime,
  fmtMB,
  fmtRate,
  fmtElapsed,
  timeLeftLabel,
  applyFilter,
  computeCounts,
  sessionToDashboard,
  aggregateTransfer,
  bytesToMB,
  type DashboardTorrent,
} from './dashboard'
import type { TorrentSession } from './torrents'

function torrent(overrides: Partial<DashboardTorrent> = {}): DashboardTorrent {
  return {
    id: 't', name: 'n', type: '', size: '1 MB', totalSec: 10,
    peers: 1, seeds: 1, progress: 0.5, status: 'dl', ...overrides,
  }
}

function session(overrides: Partial<TorrentSession> = {}): TorrentSession {
  return {
    id: 's', infoHash: 'h', name: 'Name', status: 'downloading',
    totalSize: 1000, downloadedBytes: 500, peersCount: 3,
    downloadSpeed: 100, uploadSpeed: 50, createdAt: '2026-01-01T00:00:00Z', ...overrides,
  }
}

describe('fmtTime', () => {
  it('formats every bucket', () => {
    expect(fmtTime(null)).toBe('Completed')
    expect(fmtTime(0.5)).toBe('< 1 sec')
    expect(fmtTime(45)).toBe('45 sec')
    expect(fmtTime(90)).toBe('1m 30s')
    expect(fmtTime(120)).toBe('2 min')
    expect(fmtTime(3661)).toBe('1h 1m')
  })
})

describe('fmtMB / fmtElapsed / bytesToMB', () => {
  it('formats', () => {
    expect(fmtMB(3.14159)).toBe('3.1')
    expect(fmtElapsed(125)).toBe('2 min 05 sec')
    expect(bytesToMB(1024 * 1024)).toBe(1)
  })
})

describe('fmtRate (adaptive units)', () => {
  it('picks B/s, KB/s or MB/s so small seeding rates stay visible', () => {
    const MB = 1024 * 1024
    expect(fmtRate(0)).toEqual({ value: '0', unit: 'B/s' })
    expect(fmtRate(184 / MB)).toEqual({ value: '184', unit: 'B/s' })
    expect(fmtRate(0.5)).toEqual({ value: '512.0', unit: 'KB/s' })
    expect(fmtRate(3.14159)).toEqual({ value: '3.1', unit: 'MB/s' })
  })
})

describe('timeLeftLabel', () => {
  it('reflects real state', () => {
    expect(timeLeftLabel(torrent({ status: 'pa' }))).toBe('Paused')
    expect(timeLeftLabel(torrent({ progress: 1 }))).toBe('Completed')
    expect(timeLeftLabel(torrent({ totalSec: 30 }))).toBe('30 sec')
    expect(timeLeftLabel(torrent({ totalSec: null, progress: 0.5, status: 'dl' }))).toBe('Stalled')
  })
})

describe('applyFilter', () => {
  const list = [
    torrent({ id: 'a', status: 'dl', progress: 0.2 }),
    torrent({ id: 'b', status: 'se', progress: 1 }),
    torrent({ id: 'c', status: 'pa', progress: 0.5 }),
  ]
  it('filters by tab', () => {
    expect(applyFilter(list, 'overview')).toHaveLength(3)
    expect(applyFilter(list, 'downloading').map((t) => t.id)).toEqual(['a'])
    expect(applyFilter(list, 'seeding').map((t) => t.id)).toEqual(['b'])
    expect(applyFilter(list, 'completed').map((t) => t.id)).toEqual(['b'])
  })
})

describe('computeCounts', () => {
  it('counts per state', () => {
    const counts = computeCounts([
      torrent({ status: 'dl', progress: 0.2 }),
      torrent({ status: 'se', progress: 1 }),
      torrent({ status: 'dl', progress: 0.9 }),
    ])
    expect(counts).toEqual({ ov: 3, dl: 2, se: 1, done: 1 })
  })
})

describe('sessionToDashboard', () => {
  it('maps a downloading session with an ETA', () => {
    const d = sessionToDashboard(session(), 'manga')
    expect(d.status).toBe('dl')
    expect(d.progress).toBeCloseTo(0.5)
    expect(d.totalSec).toBeCloseTo(5) // remaining 500 / 100 B/s
    expect(d.type).toBe('MANGA')
    expect(d.seeds).toBe(d.peers)
  })
  it('maps seeding (no ETA) and empty name', () => {
    const d = sessionToDashboard(session({ status: 'seeding', name: '', downloadSpeed: 0 }))
    expect(d.status).toBe('se')
    expect(d.totalSec).toBeNull()
    expect(d.name).toBe('Fetching metadata…')
    expect(d.type).toBe('')
  })
  it('maps paused/error to pa and clamps progress', () => {
    expect(sessionToDashboard(session({ status: 'paused' })).status).toBe('pa')
    expect(sessionToDashboard(session({ status: 'error' })).status).toBe('pa')
    const over = sessionToDashboard(session({ downloadedBytes: 2000, totalSize: 1000 }))
    expect(over.progress).toBe(1)
  })
  it('handles zero total size', () => {
    expect(sessionToDashboard(session({ totalSize: 0 })).progress).toBe(0)
  })
})

describe('aggregateTransfer', () => {
  it('sums speeds and computes ETA', () => {
    const agg = aggregateTransfer([
      session({ downloadSpeed: 100, uploadSpeed: 20, downloadedBytes: 500, totalSize: 1000, peersCount: 3 }),
      session({ status: 'seeding', downloadSpeed: 0, uploadSpeed: 80, downloadedBytes: 1000, totalSize: 1000, peersCount: 5 }),
    ])
    expect(agg.peers).toBe(8)
    expect(agg.downRateMB).toBeCloseTo(bytesToMB(100))
    expect(agg.upRateMB).toBeCloseTo(bytesToMB(100))
    expect(agg.timeLeftSec).toBeCloseTo(5) // remaining 500 / down 100
  })
  it('null ETA when nothing is downloading', () => {
    expect(aggregateTransfer([session({ downloadSpeed: 0 })]).timeLeftSec).toBeNull()
  })
})
