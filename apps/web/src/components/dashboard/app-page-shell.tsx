'use client'

import { type ReactNode, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'

import { AppShell } from '@/components/dashboard/app-shell'
import { listTorrents } from '@/lib/torrents'
import { computeCounts, sessionToDashboard } from '@/lib/dashboard'

// Frame for the non-dashboard app pages (/torrents/[id], /settings): the shared
// AppShell with the sidebar wired to navigate by route (filters → /library,
// Add → /add, Settings → /settings). Sidebar badges reuse the same torrents
// query as /library, so the counts stay consistent.
export function AppPageShell({
  settingsActive,
  children,
}: {
  settingsActive?: boolean
  children: ReactNode
}) {
  const router = useRouter()
  const [notifications, setNotifications] = useState(false)
  const [darkTheme, setDarkTheme] = useState(true)

  const { data: sessions = [] } = useQuery({ queryKey: ['torrents'], queryFn: listTorrents })
  const counts = computeCounts(sessions.map((s) => sessionToDashboard(s)))

  return (
    <AppShell
      counts={counts}
      settingsActive={settingsActive}
      onFilterChange={() => router.push('/library' as never)}
      onAdd={() => router.push('/add')}
      onSettings={() => router.push('/settings' as never)}
      notifications={notifications}
      onNotificationsChange={setNotifications}
      darkTheme={darkTheme}
      onDarkThemeChange={setDarkTheme}
    >
      {children}
    </AppShell>
  )
}
