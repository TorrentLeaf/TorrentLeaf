'use client'

import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { Navbar } from '@/components/layout/Navbar'

// Chrome for the authenticated app. The dashboard-family routes (/library,
// /settings, /torrents/[id]) bring their own AppShell (WindowChrome + Sidebar),
// so they render full-bleed without the top Navbar or centered container. Every
// other (app) route keeps the standard shell.
const FULL_BLEED = (p: string) =>
  p === '/library' || p === '/settings' || p === '/add' || p.startsWith('/torrents/')

export function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  if (FULL_BLEED(pathname)) {
    return <div className="min-h-screen bg-background text-foreground">{children}</div>
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <Navbar />
      <main className="container mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
    </div>
  )
}
