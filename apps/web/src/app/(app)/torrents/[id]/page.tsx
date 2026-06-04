'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { BookOpen, FileText, Trash2, Video } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { api } from '@/lib/api'
import { deleteTorrent, type TorrentSession, type TorrentFile } from '@/lib/torrents'
import { useTorrentProgress } from '@/hooks/use-torrent-progress'
import { useToast } from '@/hooks/use-toast'

function readerLinkFor(sessionId: string, file: TorrentFile): string | null {
  // CBZ chapters are self-contained — open just that chapter.
  if (file.fileType === 'cbz') {
    return `/read/manga/${sessionId}?fileId=${encodeURIComponent(file.id)}`
  }
  // Loose images belong to a single album — open the full reader and jump
  // to this image so the user can keep flipping through neighbors.
  if (file.fileType === 'image') {
    return `/read/manga/${sessionId}?startFile=${encodeURIComponent(file.id)}`
  }
  if (file.fileType === 'pdf') {
    return `/read/pdf/${encodeURIComponent(file.id)}`
  }
  if (file.fileType === 'epub') {
    return `/read/epub/${sessionId}?fileId=${encodeURIComponent(file.id)}`
  }
  if (file.fileType === 'video') {
    return `/watch/${encodeURIComponent(file.id)}?title=${encodeURIComponent(file.name)}`
  }
  return null
}

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1)
  return `${(n / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

function fileIcon(fileType: string) {
  if (fileType === 'video') return Video
  if (fileType === 'pdf') return FileText
  return BookOpen
}

export default function TorrentDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const router = useRouter()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [deleteOpen, setDeleteOpen] = useState(false)

  const { data: session, isLoading } = useQuery({
    queryKey: ['torrent', id],
    queryFn: async () => (await api.get<TorrentSession>(`/torrents/${id}`)).data,
    refetchInterval: 5_000,
  })

  const { progress, status } = useTorrentProgress(id)

  const deleteM = useMutation({
    mutationFn: () => deleteTorrent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['library'] })
      queryClient.invalidateQueries({ queryKey: ['torrent'] })
      toast({ title: 'Torrent deleted', description: 'The torrent has been removed.' })
      router.replace('/library')
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to delete torrent. Please try again.', variant: 'destructive' })
    },
  })

  if (isLoading || !session) {
    return <p className="text-sm text-muted-foreground">Loading torrent…</p>
  }

  const pct = progress ? Math.round(progress.progress * 100) : 0

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4">
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
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-destructive"
          onClick={() => setDeleteOpen(true)}
          aria-label="Delete torrent"
          title="Delete torrent"
        >
          <Trash2 className="h-5 w-5" />
        </Button>
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

      {session.files && session.files.length > 0 && (() => {
        const imageFiles = session.files.filter((f) => f.fileType === 'image')
        const hasMultipleImages = imageFiles.length > 1
        const readAllHref = `/read/manga/${session.id}`

        return (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Files</CardTitle>
                  <CardDescription>{session.files.length} file(s) detected in this torrent.</CardDescription>
                </div>
                {hasMultipleImages && (
                  <Button asChild size="sm">
                    <Link href={readAllHref as never}>
                      <BookOpen className="mr-1 h-4 w-4" />
                      Read All ({imageFiles.length} pages)
                    </Link>
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-border">
                {session.files.map((f) => {
                  const href = readerLinkFor(session.id, f)
                  const Icon = fileIcon(f.fileType)
                  return (
                    <li key={f.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="truncate">{f.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {f.fileType} · {formatBytes(f.length)}
                        </p>
                      </div>
                      {href && (
                        <Button asChild size="sm" variant="secondary">
                          <Link href={href as never}>
                            <Icon className="mr-1 h-4 w-4" />
                            {f.fileType === 'video' ? 'Watch' : 'Read'}
                          </Link>
                        </Button>
                      )}
                    </li>
                  )
                })}
              </ul>
            </CardContent>
          </Card>
        )
      })()}

      {/* Delete confirmation dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete torrent</DialogTitle>
            <DialogDescription>
              This will permanently remove <strong>{session.name || 'this torrent'}</strong> from
              your library, including all reading progress and files. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                deleteM.mutate()
                setDeleteOpen(false)
              }}
              disabled={deleteM.isPending}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {deleteM.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
