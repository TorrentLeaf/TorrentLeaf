export type TorrentStatus =
  | 'fetching_metadata'
  | 'downloading'
  | 'seeding'
  | 'paused'
  | 'error'

export interface TorrentFile {
  id: string
  index: number
  name: string
  length: number
  mimeType: string
  fileType: string
  priority: number
}

export interface TorrentSession {
  id: string
  infoHash: string
  name: string
  status: TorrentStatus
  totalSize: number
  downloadedBytes: number
  peersCount: number
  downloadSpeed: number
  uploadSpeed: number
  files?: TorrentFile[]
  createdAt: string
}

/** Payload published by the engine to Redis `torrent:progress:<hash>`
 *  and forwarded verbatim by the WebSocket endpoint. */
export interface TorrentProgress {
  infoHash: string
  progress: number
  downloadSpeed: number
  uploadSpeed: number
  peers: number
}

import { api } from './api'

export async function listTorrents(): Promise<TorrentSession[]> {
  const { data } = await api.get<TorrentSession[]>('/torrents')
  return data
}

export async function deleteTorrent(id: string): Promise<void> {
  await api.delete(`/torrents/${id}`)
}

export async function addTorrent(magnetURI: string): Promise<TorrentSession> {
  const { data } = await api.post<TorrentSession>('/torrents', { magnetURI })
  return data
}

export async function addTorrentFile(file: File): Promise<{ id: string; name: string }> {
  const form = new FormData()
  form.append('torrent', file)
  // axios sets the multipart boundary automatically for FormData.
  const { data } = await api.post<{ id: string; name: string }>('/torrents/file', form)
  return data
}
