// Shared view-model + helpers for the dashboard widgets. These components are
// presentational: the landing preview feeds them mock data (INITIAL_TORRENTS),
// and /library feeds them real torrent data mapped into DashboardTorrent.

export type TorrentStatus = 'dl' | 'se' | 'pa' // downloading · seeding · paused

export type DashboardTorrent = {
  id: string
  name: string
  type: string // short label, e.g. 'CBZ' | 'PDF' | 'EPUB'
  size: string // pre-formatted, e.g. '4.2 GB'
  totalSec: number | null // est. time left in seconds; null = completed/paused
  peers: number
  seeds: number
  progress: number // 0..1
  status: TorrentStatus
}

export type DashboardFilter = 'overview' | 'downloading' | 'seeding' | 'completed'

export type DashboardCounts = { ov: number; dl: number; se: number; done: number }

// ——— formatters (ported from design components.reference.jsx) ———
export function fmtTime(s: number | null): string {
  if (s == null) return 'Completed'
  if (s < 1) return '< 1 sec'
  if (s < 60) return `${Math.round(s)} sec`
  const m = Math.floor(s / 60)
  const r = Math.round(s % 60)
  if (m < 60) return r ? `${m}m ${r}s` : `${m} min`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

export const fmtMB = (n: number): string => n.toFixed(1)

export function fmtElapsed(s: number): string {
  const m = Math.floor(s / 60)
  const r = Math.floor(s % 60)
  return `${m} min ${r.toString().padStart(2, '0')} sec`
}

// Human label for the "Time left" column, driven by real state rather than a
// null ETA (a stalled download must not read as "Completed").
export function timeLeftLabel(t: DashboardTorrent): string {
  if (t.status === 'pa') return 'Paused'
  if (t.progress >= 1) return 'Completed'
  if (t.totalSec != null) return fmtTime(t.totalSec)
  return 'Stalled'
}

export function applyFilter(
  torrents: DashboardTorrent[],
  filter: DashboardFilter,
): DashboardTorrent[] {
  if (filter === 'downloading') return torrents.filter((t) => t.status === 'dl')
  if (filter === 'seeding') return torrents.filter((t) => t.status === 'se')
  if (filter === 'completed') return torrents.filter((t) => t.progress >= 1)
  return torrents
}

export function computeCounts(torrents: DashboardTorrent[]): DashboardCounts {
  return {
    ov: torrents.length,
    dl: torrents.filter((t) => t.status === 'dl').length,
    se: torrents.filter((t) => t.status === 'se').length,
    done: torrents.filter((t) => t.progress >= 1).length,
  }
}

// ——— REAL DATA mapping (used by /library) ———
import { formatBytes } from './utils'
import type { TorrentSession } from './torrents'
import type { LibraryItemType } from './library'

const MB = 1024 * 1024
export const bytesToMB = (b: number): number => b / MB

// Engine statuses → the dashboard's 3-state model.
function mapStatus(s: TorrentSession['status']): TorrentStatus {
  if (s === 'seeding') return 'se'
  if (s === 'paused' || s === 'error') return 'pa'
  return 'dl' // downloading | fetching_metadata
}

const TYPE_LABEL: Record<LibraryItemType, string> = {
  manga: 'MANGA',
  book: 'BOOK',
  document: 'DOC',
  video: 'VIDEO',
  other: 'FILE',
}

// Map a real torrent session (+ optional library type) into the view-model.
// NOTE: the API exposes no "seeds" — only peersCount — so `seeds` mirrors peers
// and the /library table hides the Seeds column (see TorrentTable hideSeeds).
export function sessionToDashboard(
  session: TorrentSession,
  libraryType?: LibraryItemType,
): DashboardTorrent {
  const status = mapStatus(session.status)
  const progress =
    session.totalSize > 0 ? Math.min(1, session.downloadedBytes / session.totalSize) : 0
  const remaining = Math.max(0, session.totalSize - session.downloadedBytes)
  const totalSec =
    status === 'dl' && session.downloadSpeed > 0 ? remaining / session.downloadSpeed : null
  return {
    id: session.id,
    name: session.name || 'Fetching metadata…',
    type: libraryType ? TYPE_LABEL[libraryType] : '',
    size: formatBytes(session.totalSize),
    totalSec,
    peers: session.peersCount,
    seeds: session.peersCount,
    progress,
    status,
  }
}

// Aggregate live transfer stats across all sessions (all real numbers).
export function aggregateTransfer(sessions: TorrentSession[]) {
  let down = 0
  let up = 0
  let downloaded = 0
  let peers = 0
  let remaining = 0
  for (const s of sessions) {
    down += s.downloadSpeed
    up += s.uploadSpeed
    downloaded += s.downloadedBytes
    peers += s.peersCount
    if (mapStatus(s.status) === 'dl') remaining += Math.max(0, s.totalSize - s.downloadedBytes)
  }
  const downRateMB = bytesToMB(down)
  return {
    downRateMB,
    upRateMB: bytesToMB(up),
    downloadedMB: bytesToMB(downloaded),
    peers,
    timeLeftSec: down > 0 ? remaining / down : null,
  }
}

// ——— MOCK DATA — landing preview only. Stage 07 animates this; /library
// replaces it with real torrent data. ———
export const INITIAL_TORRENTS: DashboardTorrent[] = [
  { id: 't1', name: 'Berserk · Deluxe Edition Vol 1-14', type: 'CBZ', size: '4.2 GB', totalSec: 38, peers: 8, seeds: 21, progress: 0.18, status: 'dl' },
  { id: 't2', name: 'The Pragmatic Programmer · 20th Anniversary', type: 'EPUB', size: '12 MB', totalSec: 6, peers: 11, seeds: 54, progress: 0.41, status: 'dl' },
  { id: 't3', name: 'Chainsaw Man · Complete Volume Pack', type: 'CBZ', size: '2.8 GB', totalSec: 64, peers: 2, seeds: 9, progress: 0.94, status: 'dl' },
  { id: 't4', name: 'Designing Data-Intensive Applications', type: 'PDF', size: '24 MB', totalSec: null, peers: 21, seeds: 11, progress: 1.0, status: 'se' },
  { id: 't5', name: 'Vagabond · Vizbig Edition', type: 'CBZ', size: '1.4 GB', totalSec: null, peers: 21, seeds: 11, progress: 0.62, status: 'pa' },
  { id: 't6', name: 'Refactoring · 2nd Edition', type: 'PDF', size: '46 MB', totalSec: null, peers: 6, seeds: 18, progress: 1.0, status: 'se' },
]
