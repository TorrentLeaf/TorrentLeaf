export type FileType = 'image' | 'pdf' | 'epub' | 'cbz' | 'cbr' | 'zip' | 'video' | 'unknown'

export interface FileInfo {
  index: number
  name: string
  path: string
  length: number
  mimeType: string
  fileType: FileType
}

export interface TorrentStatus {
  infoHash: string
  name: string
  ready: boolean
  progress: number
  downloadSpeed: number
  uploadSpeed: number
  peers: number
  length: number
  downloaded: number
  files: FileInfo[]
}
