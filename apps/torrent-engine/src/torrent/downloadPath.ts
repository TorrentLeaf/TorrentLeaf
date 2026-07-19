import path from 'node:path'
import { AddTorrentError } from './errors.js'

/**
 * Resolve a per-user download subfolder to an absolute path guaranteed to live
 * inside `base`. Rejects absolute paths and any `..` traversal (security).
 */
export function resolveDownloadPath(base: string, sub?: string): string {
  const baseAbs = path.resolve(base)
  if (!sub || sub.trim() === '') return baseAbs
  if (path.isAbsolute(sub)) {
    throw new AddTorrentError('invalid_path', 'download path must be a relative subfolder')
  }
  const resolved = path.resolve(baseAbs, sub)
  const rel = path.relative(baseAbs, resolved)
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new AddTorrentError('invalid_path', 'download path escapes the data directory')
  }
  return resolved
}
