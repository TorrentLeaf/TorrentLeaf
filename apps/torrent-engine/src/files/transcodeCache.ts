import { existsSync, readdirSync, statSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { config } from '../config.js'
import { logger } from '../logger.js'

/**
 * Disk cache for transcoded video artifacts, shared by the transmux (full
 * seekable MP4) and HLS (per-segment) routes. Paths are defined here once so
 * that creation and cleanup always agree.
 *
 * Layout under <downloadPath>/.transcode/:
 *   <infoHash>.<fileIndex>.<audioKey>.mp4     — full MP4 cache (transmux)
 *   hls/<infoHash>.<fileIndex>.<audioKey>/    — directory of .ts segments
 *
 * Without this the cache grew unbounded and filled the disk. It's bounded two
 * ways: cleared when a torrent is removed, and capped by total size (oldest
 * entries evicted), which also reclaims anything orphaned by past removals.
 */

export const TRANSCODE_DIR = join(config.downloadPath, '.transcode')
export const TRANSCODE_HLS_DIR = join(TRANSCODE_DIR, 'hls')

export function mp4CachePath(infoHash: string, fileIndex: number, audioKey: string): string {
  return join(TRANSCODE_DIR, `${infoHash}.${fileIndex}.${audioKey}.mp4`)
}

export function hlsSegmentDir(infoHash: string, fileIndex: number, audioKey: string): string {
  return join(TRANSCODE_HLS_DIR, `${infoHash}.${fileIndex}.${audioKey}`)
}

/** Delete every cached artifact for a torrent. Called when it's removed. */
export function clearTranscodeCache(infoHash: string): void {
  let removed = 0
  if (existsSync(TRANSCODE_DIR)) {
    for (const name of readdirSync(TRANSCODE_DIR)) {
      if (name !== 'hls' && name.startsWith(`${infoHash}.`)) {
        rmSync(join(TRANSCODE_DIR, name), { force: true })
        removed++
      }
    }
  }
  if (existsSync(TRANSCODE_HLS_DIR)) {
    for (const name of readdirSync(TRANSCODE_HLS_DIR)) {
      if (name.startsWith(`${infoHash}.`)) {
        rmSync(join(TRANSCODE_HLS_DIR, name), { recursive: true, force: true })
        removed++
      }
    }
  }
  if (removed > 0) logger.info({ infoHash, removed }, 'cleared transcode cache')
}

interface CacheEntry {
  path: string
  size: number
  mtimeMs: number
  recursive: boolean
}

/** Recursively sum a directory's byte size and find its newest mtime. */
function dirStats(dir: string): { size: number; mtimeMs: number } {
  let size = 0
  let mtimeMs = 0
  for (const name of readdirSync(dir)) {
    const st = statSync(join(dir, name))
    if (st.isDirectory()) {
      const sub = dirStats(join(dir, name))
      size += sub.size
      mtimeMs = Math.max(mtimeMs, sub.mtimeMs)
    } else {
      size += st.size
      mtimeMs = Math.max(mtimeMs, st.mtimeMs)
    }
  }
  return { size, mtimeMs }
}

function listCacheEntries(): CacheEntry[] {
  const entries: CacheEntry[] = []
  if (existsSync(TRANSCODE_DIR)) {
    for (const name of readdirSync(TRANSCODE_DIR)) {
      if (name === 'hls' || name.endsWith('.part')) continue // skip nested dir + in-progress
      const p = join(TRANSCODE_DIR, name)
      const st = statSync(p)
      entries.push({ path: p, size: st.size, mtimeMs: st.mtimeMs, recursive: false })
    }
  }
  if (existsSync(TRANSCODE_HLS_DIR)) {
    for (const name of readdirSync(TRANSCODE_HLS_DIR)) {
      const p = join(TRANSCODE_HLS_DIR, name)
      const { size, mtimeMs } = dirStats(p)
      entries.push({ path: p, size, mtimeMs, recursive: true })
    }
  }
  return entries
}

/**
 * Evict oldest entries (by mtime) until the cache is under the configured
 * size cap. Called after a new artifact is finalized. A cap of 0 disables it.
 */
export function enforceCacheLimit(): void {
  const cap = config.maxTranscodeCacheGB * 1024 ** 3
  if (cap <= 0) return
  const entries = listCacheEntries()
  let total = entries.reduce((a, e) => a + e.size, 0)
  if (total <= cap) return

  entries.sort((a, b) => a.mtimeMs - b.mtimeMs) // oldest first
  for (const e of entries) {
    if (total <= cap) break
    try {
      rmSync(e.path, { recursive: e.recursive, force: true })
      total -= e.size
      logger.info({ path: e.path, freedBytes: e.size }, 'evicted transcode cache entry')
    } catch {
      // entry may be mid-write or already gone; skip it
    }
  }
}
