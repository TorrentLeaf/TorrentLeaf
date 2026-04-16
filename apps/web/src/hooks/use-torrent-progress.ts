'use client'

import { useEffect, useState } from 'react'
import { useAuthStore } from '@/store/auth'
import type { TorrentProgress } from '@/lib/torrents'

const WS_BASE =
  process.env.NEXT_PUBLIC_WS_URL ??
  (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080').replace(/^http/, 'ws')

type Status = 'connecting' | 'open' | 'closed' | 'error'

export function useTorrentProgress(torrentId: string | null | undefined) {
  const token = useAuthStore((s) => s.accessToken)
  const [progress, setProgress] = useState<TorrentProgress | null>(null)
  const [status, setStatus] = useState<Status>('connecting')

  useEffect(() => {
    if (!torrentId || !token) return

    const url = `${WS_BASE}/api/v1/torrents/${torrentId}/ws?token=${encodeURIComponent(token)}`
    const ws = new WebSocket(url)
    setStatus('connecting')

    ws.onopen = () => setStatus('open')
    ws.onerror = () => setStatus('error')
    ws.onclose = () => setStatus('closed')
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as TorrentProgress | { type: string }
        if ('progress' in msg) setProgress(msg)
      } catch {
        // ignore malformed frames
      }
    }

    return () => {
      ws.close()
    }
  }, [torrentId, token])

  return { progress, status }
}
