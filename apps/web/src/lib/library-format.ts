import { BookOpen, FileText, BookMarked, Film, Files } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { LibraryCard } from './library'

// The coarse content format used by the sidebar Library filters. Derived by the
// API from each session's dominant file type (see apps/api .../library.go).
export type LibraryFormat = 'comics' | 'books' | 'pdfs' | 'video' | 'other'

export const LIBRARY_FORMATS: { id: LibraryFormat; label: string; icon: LucideIcon }[] = [
  { id: 'comics', label: 'Comics', icon: BookOpen },
  { id: 'books', label: 'Books', icon: BookMarked },
  { id: 'pdfs', label: 'PDFs', icon: FileText },
  { id: 'video', label: 'Video', icon: Film },
  { id: 'other', label: 'Other', icon: Files },
]

export function countByFormat(cards: Pick<LibraryCard, 'format'>[]): Record<LibraryFormat, number> {
  const counts: Record<LibraryFormat, number> = { comics: 0, books: 0, pdfs: 0, video: 0, other: 0 }
  for (const c of cards) counts[c.format] = (counts[c.format] ?? 0) + 1
  return counts
}
