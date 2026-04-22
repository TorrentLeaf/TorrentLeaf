import path from 'node:path'
import type { WTTorrent } from '../torrent/engine.js'
import type { FileInfo, FileType } from '../torrent/types.js'

const EXT_TO_TYPE: Record<string, FileType> = {
  '.jpg': 'image',
  '.jpeg': 'image',
  '.png': 'image',
  '.webp': 'image',
  '.avif': 'image',
  '.gif': 'image',
  '.pdf': 'pdf',
  '.epub': 'epub',
  '.cbz': 'cbz',
  '.cbr': 'cbr',
  '.zip': 'zip',
}

const EXT_TO_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf',
  '.epub': 'application/epub+zip',
  '.cbz': 'application/vnd.comicbook+zip',
  '.cbr': 'application/vnd.comicbook-rar',
  '.zip': 'application/zip',
}

const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.sh', '.bash', '.zsh', '.bat', '.cmd', '.ps1',
  '.msi', '.dmg', '.pkg', '.deb', '.rpm', '.appimage',
  '.vbs', '.js', '.ts', '.py', '.rb', '.pl',
])

export function detectMime(filename: string): string {
  return EXT_TO_MIME[path.extname(filename).toLowerCase()] ?? 'application/octet-stream'
}

export function classifyFile(filename: string): FileType {
  return EXT_TO_TYPE[path.extname(filename).toLowerCase()] ?? 'unknown'
}

export function isBlocked(filename: string): boolean {
  return BLOCKED_EXTENSIONS.has(path.extname(filename).toLowerCase())
}

export function isSafePath(filePath: string): boolean {
  const normalized = path.normalize(filePath)
  return !normalized.split(/[/\\]/).includes('..') && !path.isAbsolute(normalized)
}

export function analyzeFiles(torrent: WTTorrent): FileInfo[] {
  return torrent.files
    .map((file, index) => ({
      index,
      name: file.name,
      path: file.path,
      length: file.length,
      mimeType: detectMime(file.name),
      fileType: classifyFile(file.name),
    }))
    .filter((f) => isSafePath(f.path) && !isBlocked(f.name))
}
