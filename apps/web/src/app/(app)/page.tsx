import Link from 'next/link'
import { BookOpen, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

export default function HomePage() {
  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Sua biblioteca</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Mangás, livros e documentos em streaming direto do swarm.
          </p>
        </div>
      </div>

      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-2">
            <BookOpen className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Sua biblioteca está vazia</h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              Cole um link magnet ou URL de .torrent para começar a ler. O TorrentLeaf baixa
              apenas o que você está lendo.
            </p>
          </div>
          <Button asChild>
            <Link href="/add">
              <Plus className="mr-2 h-4 w-4" />
              Adicionar torrent
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
