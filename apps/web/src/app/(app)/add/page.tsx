'use client'

import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { MagnetInput } from '@/components/shared/MagnetInput'
import { AppPageShell } from '@/components/dashboard/app-page-shell'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'

export default function AddTorrentPage() {
  const router = useRouter()
  const { toast } = useToast()

  async function handleAdd(magnetURI: string) {
    const { data } = await api.post<{ id: string; name: string }>('/torrents', { magnetURI })
    toast({ title: 'Torrent added', description: data.name || 'Fetching metadata…' })
    router.push(`/torrents/${data.id}` as never)
  }

  return (
    <AppPageShell>
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
          <CardContent>
            <MagnetInput onSubmit={handleAdd} />
          </CardContent>
        </Card>
      </div>
    </AppPageShell>
  )
}
