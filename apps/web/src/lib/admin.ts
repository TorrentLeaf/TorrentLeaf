import { api } from './api'

export interface AdminTorrent {
  id: string
  userId: string
  infoHash: string
  name: string
  status: 'fetching_metadata' | 'downloading' | 'seeding' | 'paused' | 'error'
  totalSize: number
  downloadedBytes: number
  peersCount: number
  downloadSpeed: number
  uploadSpeed: number
  createdAt: string
}

export async function fetchAdminTorrents() {
  const { data } = await api.get<AdminTorrent[]>('/admin/torrents')
  return data
}

export async function pauseTorrent(id: string) {
  await api.post(`/admin/torrents/${id}/pause`)
}

export async function resumeTorrent(id: string) {
  await api.post(`/admin/torrents/${id}/resume`)
}

export async function deleteTorrent(id: string) {
  await api.delete(`/admin/torrents/${id}`)
}
