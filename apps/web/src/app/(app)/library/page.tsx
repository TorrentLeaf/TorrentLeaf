'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Library as LibraryIcon } from 'lucide-react'

import {
  fetchLibrary,
  setFavorite,
  type LibraryItemType,
} from '@/lib/library'
import { TorrentCard } from '@/components/shared/TorrentCard'
import { Button } from '@/components/ui/button'

type FilterType = LibraryItemType | 'all'

const FILTERS: { value: FilterType; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'manga', label: 'Manga' },
  { value: 'book', label: 'Books' },
  { value: 'document', label: 'Documents' },
  { value: 'other', label: 'Other' },
]

export default function LibraryPage() {
  const [typeFilter, setTypeFilter] = useState<FilterType>('all')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const queryClient = useQueryClient()

  const { data: cards = [], isLoading } = useQuery({
    queryKey: ['library', typeFilter, favoritesOnly],
    queryFn: () => fetchLibrary(typeFilter, favoritesOnly),
  })

  const toggleFav = useMutation({
    mutationFn: ({ id, current }: { id: string; current: boolean }) =>
      setFavorite(id, !current),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['library'] })
    },
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Library</h1>
        <p className="mt-1 text-sm text-[hsl(var(--muted))]">
          Your saved torrents, organized and ready to read.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f.value}
            variant={typeFilter === f.value ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setTypeFilter(f.value)}
          >
            {f.label}
          </Button>
        ))}
        <div className="mx-2 h-5 w-px bg-[hsl(var(--border))]" />
        <Button
          variant={favoritesOnly ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setFavoritesOnly((v) => !v)}
        >
          Favorites
        </Button>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="aspect-[2/3] animate-pulse rounded-xl bg-[hsl(var(--surface-2))]"
            />
          ))}
        </div>
      ) : cards.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-24 text-[hsl(var(--muted))]">
          <LibraryIcon className="h-12 w-12" />
          <p className="text-sm">
            {favoritesOnly
              ? 'No favorites yet. Star items to find them here.'
              : 'Your library is empty. Add a torrent to get started.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {cards.map((card) => (
            <TorrentCard
              key={card.id}
              card={card}
              onToggleFavorite={(id, current) =>
                toggleFav.mutate({ id, current })
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}
