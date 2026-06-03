'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Star, Book, FileText, Image, File, Video, Trash2, MoreVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { LibraryCard, LibraryItemType } from '@/lib/library'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const typeIcon: Record<LibraryItemType, typeof Book> = {
  manga: Image,
  book: Book,
  document: FileText,
  video: Video,
  other: File,
}

const typeLabel: Record<LibraryItemType, string> = {
  manga: 'Manga',
  book: 'Book',
  document: 'Document',
  video: 'Video',
  other: 'Other',
}

interface TorrentCardProps {
  card: LibraryCard
  onToggleFavorite?: (id: string, current: boolean) => void
  onDelete?: (id: string) => void
}

export function TorrentCard({ card, onToggleFavorite, onDelete }: TorrentCardProps) {
  const Icon = typeIcon[card.type] ?? File
  const progressPct =
    card.totalPages > 0
      ? Math.round((card.currentPage / card.totalPages) * 100)
      : 0

  const [menuOpen, setMenuOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  // Library card click lands on the torrent detail page, where the user picks
  // a specific file to read. The card itself doesn't know the underlying file
  // types (a session can mix PDFs, CBZs and loose images), so routing directly
  // to a reader was brittle — e.g. a CBZ session with type='other' used to
  // route to the PDF reader and render "Missing PDF".
  const readLink = `/torrents/${card.sessionId}`

  return (
    <>
      <div className="group relative flex flex-col overflow-hidden rounded-xl border border-[hsl(var(--border))]/50 bg-[hsl(var(--surface))] transition-all duration-200 hover:border-[hsl(var(--accent))]/40 hover:shadow-sm">
        {/* Cover / placeholder */}
        <Link href={readLink as never} className="block">
          {card.coverUrl ? (
            <img
              src={card.coverUrl}
              alt={card.title}
              className="aspect-[2/3] w-full object-cover"
            />
          ) : (
            <div className="flex aspect-[2/3] w-full items-center justify-center bg-[hsl(var(--surface-2))]">
              <Icon className="h-12 w-12 text-[hsl(var(--muted))]" />
            </div>
          )}
        </Link>

        {/* Favorite */}
        <button
          type="button"
          aria-label={card.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          onClick={() => onToggleFavorite?.(card.id, card.isFavorite)}
          className="absolute right-2 top-2 rounded-full bg-[hsl(var(--background))]/70 p-1.5 backdrop-blur transition-colors hover:bg-[hsl(var(--background))]"
        >
          <Star
            className={cn(
              'h-4 w-4 transition-colors',
              card.isFavorite
                ? 'fill-[hsl(var(--warning))] text-[hsl(var(--warning))]'
                : 'text-[hsl(var(--muted))]',
            )}
          />
        </button>

        {/* Overflow menu */}
        <div className="absolute left-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
          <div className="relative">
            <button
              type="button"
              aria-label="More options"
              onClick={() => setMenuOpen((o) => !o)}
              className="rounded-full bg-[hsl(var(--background))]/70 p-1.5 backdrop-blur transition-colors hover:bg-[hsl(var(--background))]"
            >
              <MoreVertical className="h-4 w-4 text-[hsl(var(--muted))]" />
            </button>
            {menuOpen && (
              <div className="absolute left-0 top-full z-50 mt-1 w-36 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-1 shadow-md">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    setDeleteOpen(true)
                  }}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-[hsl(var(--destructive))] hover:bg-[hsl(var(--surface-2))]"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="flex flex-1 flex-col gap-1 p-3">
          <Link href={readLink as never}>
            <h3 className="line-clamp-2 text-sm font-medium leading-tight text-[hsl(var(--foreground))] group-hover:text-[hsl(var(--accent))] transition-colors">
              {card.title}
            </h3>
          </Link>

          <span className="text-xs text-[hsl(var(--muted))]">
            {typeLabel[card.type] ?? 'Other'}
          </span>

          {card.totalPages > 0 && (
            <div className="mt-auto space-y-1 pt-2">
              <Progress value={progressPct} className="h-1" />
              <p className="text-[10px] tabular-nums text-[hsl(var(--muted))]">
                {card.currentPage} / {card.totalPages} pages
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete torrent</DialogTitle>
            <DialogDescription>
              This will permanently remove <strong>{card.title}</strong> from your library,
              including all reading progress. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                onDelete?.(card.sessionId)
                setDeleteOpen(false)
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
