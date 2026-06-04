import { useAuthStore } from '@/store/auth'

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

export type ReadingMode = 'paginated' | 'webtoon' | 'double-page'

export interface ReaderPage {
  index: number
  fileId: string
  /** Present when the page is an entry inside a CBZ archive. */
  entryIndex?: number
  name: string
  mimeType: string
  length: number
}

export interface ReadingProgress {
  fileId: string
  currentPage: number
  totalPages: number
  readingMode: ReadingMode
  /** EPUB CFI or other free-form position marker. Empty for image/pdf. */
  location?: string
  lastReadAt?: string
}

/** Absolute URL for a page — used as <img src>. Axios isn't used here
 *  because <img> fetches directly through the browser loader, which handles
 *  streaming, caching and Range requests itself. Auth is carried by the
 *  access token on the query string since <img> cannot set headers.
 *
 *  When `entryIndex` is provided the URL targets a specific entry inside a
 *  CBZ archive; otherwise it streams the whole file. */
export function pageStreamURL(fileId: string, entryIndex?: number): string {
  const token = useAuthStore.getState().accessToken ?? ''
  const qs = `token=${encodeURIComponent(token)}`
  if (entryIndex === undefined) {
    return `${API_BASE}/api/v1/stream/${fileId}?${qs}`
  }
  return `${API_BASE}/api/v1/stream/${fileId}/${entryIndex}?${qs}`
}

/** Build a video stream URL with optional audio track selection. */
export function videoStreamURL(fileId: string, audioIndex?: number): string {
  const token = useAuthStore.getState().accessToken ?? ''
  const params = new URLSearchParams({ token })
  if (audioIndex !== undefined) params.set('audio', String(audioIndex))
  return `${API_BASE}/api/v1/stream/${fileId}?${params.toString()}`
}

/** WebVTT URL for a single subtitle track (referenced by <track src>). */
export function subtitleURL(fileId: string, streamIndex: number): string {
  const token = useAuthStore.getState().accessToken ?? ''
  return `${API_BASE}/api/v1/subtitles/${fileId}/${streamIndex}?token=${encodeURIComponent(token)}`
}

export interface VideoTrackInfo {
  index: number
  codec: string
  language: string | null
  title: string | null
}

export interface VideoMediaInfo {
  audio: VideoTrackInfo[]
  subtitles: VideoTrackInfo[]
}
