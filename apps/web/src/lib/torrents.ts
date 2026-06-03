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

export async function deleteTorrent(id: string): Promise<void> {
  await api.delete(`/torrents/${id}`)
}

export async function addTorrent(magnetURI: string): Promise<TorrentSession> {
  const { data } = await api.post<TorrentSession>('/torrents', { magnetURI })
  return data
}
