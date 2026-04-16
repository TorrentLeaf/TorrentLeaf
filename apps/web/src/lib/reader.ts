import { useAuthStore } from '@/store/auth'

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

export type ReadingMode = 'paginated' | 'webtoon' | 'double-page'

export interface ReaderPage {
  index: number
  fileId: string
  name: string
  mimeType: string
  length: number
}

export interface ReadingProgress {
  fileId: string
  currentPage: number
  totalPages: number
  readingMode: ReadingMode
  lastReadAt?: string
}

/** Absolute URL for an image page — used as <img src>. Axios isn't used here
 *  because <img> fetches directly through the browser loader, which handles
 *  streaming, caching and Range requests itself. Auth is carried by the
 *  access token on the query string since <img> cannot set headers. */
export function pageStreamURL(fileId: string): string {
  const token = useAuthStore.getState().accessToken ?? ''
  return `${API_BASE}/api/v1/stream/${fileId}?token=${encodeURIComponent(token)}`
}
