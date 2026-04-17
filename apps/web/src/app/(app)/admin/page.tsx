'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Pause,
  Play,
  Trash2,
  Shield,
  Download,
  Upload,
  Users,
} from 'lucide-react'

import {
  fetchAdminTorrents,
  pauseTorrent,
  resumeTorrent,
  deleteTorrent,
  type AdminTorrent,
} from '@/lib/admin'
import { formatBytes } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { useToast } from '@/hooks/use-toast'

const statusVariant: Record<
  AdminTorrent['status'],
  'default' | 'secondary' | 'success' | 'warning' | 'destructive'
> = {
  fetching_metadata: 'secondary',
  downloading: 'default',
  seeding: 'success',
  paused: 'warning',
  error: 'destructive',
}

const statusLabel: Record<AdminTorrent['status'], string> = {
  fetching_metadata: 'Fetching metadata',
  downloading: 'Downloading',
  seeding: 'Seeding',
  paused: 'Paused',
  error: 'Error',
}

export default function AdminPage() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const { data: torrents = [], isLoading } = useQuery({
    queryKey: ['admin-torrents'],
    queryFn: fetchAdminTorrents,
    refetchInterval: 5_000,
  })

  const pause = useMutation({
    mutationFn: pauseTorrent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-torrents'] })
      toast({ title: 'Torrent paused' })
    },
  })

  const resume = useMutation({
    mutationFn: resumeTorrent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-torrents'] })
      toast({ title: 'Torrent resumed' })
    },
  })

  const remove = useMutation({
    mutationFn: deleteTorrent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-torrents'] })
      toast({ title: 'Torrent deleted' })
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Shield className="h-6 w-6 text-[hsl(var(--accent))]" />
        <h1 className="text-3xl font-bold tracking-tight">Admin</h1>
      </div>

      <div className="flex items-center gap-4 text-sm text-[hsl(var(--muted))]">
        <span>{torrents.length} torrents</span>
        <span>
          {torrents.filter((t) => t.status === 'downloading').length} active
        </span>
        <span>
          {torrents.reduce((a, t) => a + t.peersCount, 0)} total peers
        </span>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-xl bg-[hsl(var(--surface-2))]"
            />
          ))}
        </div>
      ) : torrents.length === 0 ? (
        <p className="py-16 text-center text-sm text-[hsl(var(--muted))]">
          No torrents in the system.
        </p>
      ) : (
        <div className="space-y-3">
          {torrents.map((t) => (
            <TorrentRow
              key={t.id}
              torrent={t}
              onPause={() => pause.mutate(t.id)}
              onResume={() => resume.mutate(t.id)}
              onDelete={() => remove.mutate(t.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function TorrentRow({
  torrent: t,
  onPause,
  onResume,
  onDelete,
}: {
  torrent: AdminTorrent
  onPause: () => void
  onResume: () => void
  onDelete: () => void
}) {
  const progressPct =
    t.totalSize > 0 ? Math.round((t.downloadedBytes / t.totalSize) * 100) : 0

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[hsl(var(--border))]/50 bg-[hsl(var(--surface))] p-4 sm:flex-row sm:items-center">
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-sm font-medium text-[hsl(var(--foreground))]">
            {t.name || t.infoHash}
          </h3>
          <Badge variant={statusVariant[t.status]}>
            {statusLabel[t.status]}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-[hsl(var(--muted))]">
          <span className="flex items-center gap-1" title="Peers">
            <Users className="h-3 w-3" /> {t.peersCount}
          </span>
          <span className="flex items-center gap-1" title="Download speed">
            <Download className="h-3 w-3" /> {formatBytes(t.downloadSpeed)}/s
          </span>
          <span className="flex items-center gap-1" title="Upload speed">
            <Upload className="h-3 w-3" /> {formatBytes(t.uploadSpeed)}/s
          </span>
          <span>
            {formatBytes(t.downloadedBytes)} / {formatBytes(t.totalSize)}
          </span>
          <span className="font-mono text-[10px]">{t.infoHash.slice(0, 12)}…</span>
        </div>

        {t.totalSize > 0 && (
          <div className="flex items-center gap-2 pt-1">
            <Progress value={progressPct} className="h-1 flex-1" />
            <span className="text-[10px] tabular-nums text-[hsl(var(--muted))]">
              {progressPct}%
            </span>
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {t.status === 'paused' ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={onResume}
            aria-label="Resume torrent"
            title="Resume"
          >
            <Play className="h-4 w-4" />
          </Button>
        ) : t.status === 'downloading' || t.status === 'seeding' ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={onPause}
            aria-label="Pause torrent"
            title="Pause"
          >
            <Pause className="h-4 w-4" />
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="icon"
          onClick={onDelete}
          aria-label="Delete torrent"
          title="Delete"
          className="text-[hsl(var(--destructive))] hover:text-[hsl(var(--destructive))]"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
