'use client'

import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { MagnetInput } from '@/components/shared/MagnetInput'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'

export default function AddTorrentPage() {
  const router = useRouter()
  const { toast } = useToast()

  async function handleAdd(magnetURI: string) {
    const { data } = await api.post<{ id: string; name: string }>('/torrents', { magnetURI })
    toast({ title: 'Torrent adicionado', description: data.name ?? 'Buscando metadata…' })
    router.push('/')
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Adicionar torrent</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cole um link magnet do Nyaa.si ou de qualquer tracker público.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Magnet link</CardTitle>
          <CardDescription>O swarm conecta em segundos; a leitura começa antes do download completo.</CardDescription>
        </CardHeader>
        <CardContent>
          <MagnetInput onSubmit={handleAdd} />
        </CardContent>
      </Card>
    </div>
  )
}
