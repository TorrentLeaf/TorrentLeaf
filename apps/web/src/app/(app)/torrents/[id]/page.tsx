'use client'

import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { api } from '@/lib/api'
import type { TorrentSession } from '@/lib/torrents'
import { useTorrentProgress } from '@/hooks/use-torrent-progress'

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1)
  return `${(n / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

export default function TorrentDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params.id

  const { data: session, isLoading } = useQuery({
    queryKey: ['torrent', id],
    queryFn: async () => (await api.get<TorrentSession>(`/torrents/${id}`)).data,
    refetchInterval: 5_000,
  })

  const { progress, status } = useTorrentProgress(id)

  if (isLoading || !session) {
    return <p className="text-sm text-muted-foreground">Loading torrent…</p>
  }

  const pct = progress ? Math.round(progress.progress * 100) : 0

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {session.name || 'Fetching metadata…'}
        </h1>
        <div className="mt-2 flex items-center gap-2">
          <Badge variant="secondary">{session.status.replace('_', ' ')}</Badge>
          <span className="text-xs text-muted-foreground">
            live: <span aria-live="polite">{status}</span>
          </span>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Download progress</CardTitle>
          <CardDescription>Streaming while the swarm fills the pieces you need.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Progress value={pct} />
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-muted-foreground">Downloaded</dt>
              <dd className="font-medium">{pct}%</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Peers</dt>
              <dd className="font-medium">{progress?.peers ?? session.peersCount}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Down</dt>
              <dd className="font-medium">{formatBytes(progress?.downloadSpeed ?? 0)}/s</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Up</dt>
              <dd className="font-medium">{formatBytes(progress?.uploadSpeed ?? 0)}/s</dd>
            </div>
          </div>
        </CardContent>
      </Card>

      {session.files && session.files.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Files</CardTitle>
            <CardDescription>{session.files.length} file(s) detected in this torrent.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {session.files.map((f) => (
                <li key={f.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="truncate pr-4">{f.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {f.fileType} · {formatBytes(f.length)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
