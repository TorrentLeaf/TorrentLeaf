'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'

import { fetchLibrary } from '@/lib/library'
import { listTorrents } from '@/lib/torrents'
import {
  aggregateTransfer,
  computeCounts,
  fmtTime,
  sessionToDashboard,
  type DashboardFilter,
} from '@/lib/dashboard'
import { DashboardShell, type ChartMode } from '@/components/dashboard/dashboard-shell'
import type { StatCell } from '@/components/dashboard/stats-panel'

const HISTORY_LEN = 60
const POLL_MS = 2000

export default function LibraryPage() {
  const router = useRouter()

  // Real data: live torrent transfers (polled) + library metadata for type tags.
  const { data: sessions = [], dataUpdatedAt } = useQuery({
    queryKey: ['torrents'],
    queryFn: listTorrents,
    refetchInterval: POLL_MS,
  })
  const { data: cards = [] } = useQuery({
    queryKey: ['library', 'all'],
    queryFn: () => fetchLibrary('all'),
  })

  const [filter, setFilter] = useState<DashboardFilter>('overview')
  const [activeId, setActiveId] = useState<string>()
  const [chartMode, setChartMode] = useState<ChartMode>('download')
  const [notifications, setNotifications] = useState(false)
  const [darkTheme, setDarkTheme] = useState(true)

  // Map a session id → library type for the type tag (real, from /library).
  const typeBySession = useMemo(() => {
    const m = new Map<string, (typeof cards)[number]['type']>()
    for (const c of cards) m.set(c.sessionId, c.type)
    return m
  }, [cards])

  const torrents = useMemo(
    () => sessions.map((s) => sessionToDashboard(s, typeBySession.get(s.id))),
    [sessions, typeBySession],
  )
  const counts = useMemo(() => computeCounts(torrents), [torrents])
  const agg = useMemo(() => aggregateTransfer(sessions), [sessions])

  // Real transfer-speed history, sampled once per successful poll.
  const [downHistory, setDownHistory] = useState<number[]>([])
  const [upHistory, setUpHistory] = useState<number[]>([])
  const lastSampleAt = useRef(0)
  useEffect(() => {
    if (!dataUpdatedAt || dataUpdatedAt === lastSampleAt.current) return
    lastSampleAt.current = dataUpdatedAt
    const seedOrPush = (prev: number[], v: number) =>
      prev.length === 0 ? Array<number>(HISTORY_LEN).fill(v) : [...prev.slice(1), v]
    setDownHistory((p) => seedOrPush(p, agg.downRateMB))
    setUpHistory((p) => seedOrPush(p, agg.upRateMB))
  }, [dataUpdatedAt, agg.downRateMB, agg.upRateMB])

  // Real stat cells — only metrics the API actually provides (no fabricated
  // uploaded/ratio). "Library items" comes from real /library data.
  const stats: StatCell[] = [
    { label: 'Downloading', value: counts.dl },
    { label: 'Seeding', value: counts.se },
    { label: 'Peers', value: agg.peers },
    { label: 'Downloaded', value: `${Math.round(agg.downloadedMB)} MB` },
    { label: 'Library items', value: cards.length },
    { label: 'Time left', value: fmtTime(agg.timeLeftSec) },
  ]

  return (
    <DashboardShell
      torrents={torrents}
      counts={counts}
      filter={filter}
      onFilterChange={setFilter}
      activeId={activeId}
      onActiveChange={(id) => {
        setActiveId(id)
        router.push(`/torrents/${id}` as never)
      }}
      history={chartMode === 'upload' ? upHistory : downHistory}
      downRate={agg.downRateMB}
      upRate={agg.upRateMB}
      stats={stats}
      chartMode={chartMode}
      onChartModeChange={setChartMode}
      notifications={notifications}
      onNotificationsChange={setNotifications}
      darkTheme={darkTheme}
      onDarkThemeChange={setDarkTheme}
      onAdd={() => router.push('/add')}
      onSettings={() => router.push('/settings' as never)}
      hideSeeds
    />
  )
}
