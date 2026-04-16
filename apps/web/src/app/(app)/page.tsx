import Link from 'next/link'
import { BookOpen, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

export default function HomePage() {
  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Your library</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manga, books, and documents streamed directly from the swarm.
          </p>
        </div>
      </div>

      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-2">
            <BookOpen className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Your library is empty</h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              Paste a magnet link or .torrent URL to start reading. TorrentLeaf downloads only
              the parts you are actually reading.
            </p>
          </div>
          <Button asChild>
            <Link href="/add">
              <Plus className="mr-2 h-4 w-4" />
              Add torrent
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
