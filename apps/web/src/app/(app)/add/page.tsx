'use client'

import { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { MagnetInput } from '@/components/shared/MagnetInput'
import { TorrentFileInput } from '@/components/shared/TorrentFileInput'
import { RegisterMagnetHandler } from '@/components/shared/RegisterMagnetHandler'
import { AppPageShell } from '@/components/dashboard/app-page-shell'
import { api } from '@/lib/api'
import { addTorrentFile } from '@/lib/torrents'
import { useToast } from '@/hooks/use-toast'

function AddTorrentContent() {
  const router = useRouter()
  const { toast } = useToast()
  const search = useSearchParams()
  const initialMagnet = search.get('magnet') ?? undefined

  async function handleAdd(magnetURI: string) {
    try {
      const { data } = await api.post<{ id: string; name: string }>('/torrents', { magnetURI })
      toast({ title: 'Torrent added', description: data.name || 'Fetching metadata…' })
      router.push(`/torrents/${data.id}` as never)
    } catch (err) {
      toast({
        title: 'Could not add torrent',
        description: err instanceof Error ? err.message : 'Unexpected error',
        variant: 'destructive',
      })
      throw err // let MagnetInput surface the inline message too
    }
  }

  async function handleAddFile(file: File) {
    try {
      const data = await addTorrentFile(file)
      toast({ title: 'Torrent added', description: data.name || 'Fetching metadata…' })
      router.push(`/torrents/${data.id}` as never)
    } catch (err) {
      toast({
        title: 'Could not add torrent',
        description: err instanceof Error ? err.message : 'Unexpected error',
        variant: 'destructive',
      })
      throw err
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-5 md:p-6 lg:p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Add torrent</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Paste a magnet link from Nyaa.si or any public tracker.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Magnet link</CardTitle>
          <CardDescription>The swarm connects in seconds; reading starts before the download completes.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {initialMagnet && (
            <p className="text-sm text-muted-foreground">Magnet link received — review and click Add.</p>
          )}
          <MagnetInput onSubmit={handleAdd} defaultValue={initialMagnet} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Torrent file</CardTitle>
          <CardDescription>Upload a .torrent file to start reading from it.</CardDescription>
        </CardHeader>
        <CardContent>
          <TorrentFileInput onSubmit={handleAddFile} />
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-3 rounded-md border border-border px-4 py-3">
        <p className="text-sm text-muted-foreground">
          Make clicking magnet links open here automatically.
        </p>
        <RegisterMagnetHandler />
      </div>
    </div>
  )
}

export default function AddTorrentPage() {
  return (
    <AppPageShell>
      <Suspense fallback={null}>
        <AddTorrentContent />
      </Suspense>
    </AppPageShell>
  )
}
