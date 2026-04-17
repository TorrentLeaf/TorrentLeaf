import { api } from './api'

export type LibraryItemType = 'manga' | 'book' | 'document' | 'other'

export interface LibraryCard {
  id: string
  sessionId: string
  title: string
  coverUrl?: string
  type: LibraryItemType
  addedAt: string
  isFavorite: boolean
  currentPage: number
  totalPages: number
  lastReadAt?: string
}

export async function fetchLibrary(
  type?: LibraryItemType | 'all',
  favoritesOnly?: boolean,
) {
  const params = new URLSearchParams()
  if (type && type !== 'all') params.set('type', type)
  if (favoritesOnly) params.set('favorites', 'true')
  const { data } = await api.get<LibraryCard[]>(`/library?${params}`)
  return data
}

export async function addToLibrary(sessionId: string, type?: LibraryItemType, title?: string) {
  const { data } = await api.post<LibraryCard>('/library', { sessionId, type, title })
  return data
}

export async function removeFromLibrary(id: string) {
  await api.delete(`/library/${id}`)
}

export async function setFavorite(id: string, favorite: boolean) {
  if (favorite) {
    await api.post(`/library/${id}/favorite`)
  } else {
    await api.delete(`/library/${id}/favorite`)
  }
}
