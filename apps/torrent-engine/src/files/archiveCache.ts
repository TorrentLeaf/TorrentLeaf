import { config } from '../config.js'
import { logger } from '../logger.js'
import type { ArchiveEntry } from './archive.js'

/**
 * In-memory cache for archive (CBZ/CBR/7z) reads, shared by the archive route.
 *
 * Extracting a comic page is expensive: CBR reloads the whole RAR into the
 * unrar wasm heap and 7z spawns a process that scans the archive. Without a
 * cache every page request — including the reader's +2..+5 prefetch — pays that
 * cost again, which is what made paging feel slow ("page 1 is loading").
 *
 * Two caches, keyed by a stable archive key:
 *   - listings:  `${infoHash}:${fileIndex}`               → ArchiveEntry[]
 *   - page bytes: `${infoHash}:${fileIndex}:${entryIndex}` → extracted buffer
 *
 * Both dedupe concurrent loads (prefetch + the real fetch race) via an in-flight
 * map. The byte cache is bounded by total size (oldest evicted, LRU on access);
 * listings are tiny and bounded by count. Everything for a torrent is dropped
 * when it's removed (see clearArchiveCache).
 */

export interface EntryBytes {
  buf: Buffer
  mime: string
  name: string
}

const MAX_LISTINGS = 128

const listings = new Map<string, ArchiveEntry[]>()
const listingInflight = new Map<string, Promise<ArchiveEntry[]>>()

interface BytesNode {
  bytes: EntryBytes
  size: number
}
// Insertion order doubles as LRU order: a hit re-inserts the key at the tail,
// so the head is always the least-recently-used entry to evict.
const pageBytes = new Map<string, BytesNode>()
const bytesInflight = new Map<string, Promise<EntryBytes>>()
let bytesTotal = 0

function capBytes(): number {
  return Math.max(0, config.maxArchiveCacheMB) * 1024 * 1024
}

/** Cache the entry listing for an archive, deduping concurrent loads. */
export function getCachedListing(
  key: string,
  loader: () => Promise<ArchiveEntry[]>,
): Promise<ArchiveEntry[]> {
  const hit = listings.get(key)
  if (hit) return Promise.resolve(hit)

  const pending = listingInflight.get(key)
  if (pending) return pending

  const p = loader()
    .then((entries) => {
      listings.set(key, entries)
      if (listings.size > MAX_LISTINGS) {
        const oldest = listings.keys().next().value
        if (oldest !== undefined) listings.delete(oldest)
      }
      return entries
    })
    .finally(() => listingInflight.delete(key))
  listingInflight.set(key, p)
  return p
}

/** Cache the extracted bytes of a single archive entry, deduping concurrent
 *  loads. The loader only runs on a miss; failures are not cached. */
export function getCachedEntryBytes(
  key: string,
  loader: () => Promise<EntryBytes>,
): Promise<EntryBytes> {
  const hit = pageBytes.get(key)
  if (hit) {
    pageBytes.delete(key)
    pageBytes.set(key, hit) // bump to most-recently-used
    return Promise.resolve(hit.bytes)
  }

  const pending = bytesInflight.get(key)
  if (pending) return pending

  const p = loader()
    .then((bytes) => {
      const cap = capBytes()
      const size = bytes.buf.length
      // Skip caching if it can't fit at all (cap disabled or single page > cap).
      if (cap > 0 && size <= cap) {
        pageBytes.set(key, { bytes, size })
        bytesTotal += size
        evictUntilUnder(cap)
      }
      return bytes
    })
    .finally(() => bytesInflight.delete(key))
  bytesInflight.set(key, p)
  return p
}

function evictUntilUnder(cap: number): void {
  while (bytesTotal > cap && pageBytes.size > 0) {
    const oldest = pageBytes.keys().next().value
    if (oldest === undefined) break
    const node = pageBytes.get(oldest)
    pageBytes.delete(oldest)
    if (node) bytesTotal -= node.size
  }
}

/** Drop every cached listing and page for a torrent. Called on removal. */
export function clearArchiveCache(infoHash: string): void {
  const prefix = `${infoHash}:`
  let removed = 0
  for (const k of [...listings.keys()]) {
    if (k.startsWith(prefix)) {
      listings.delete(k)
      removed++
    }
  }
  for (const k of [...pageBytes.keys()]) {
    if (k.startsWith(prefix)) {
      const node = pageBytes.get(k)
      if (node) bytesTotal -= node.size
      pageBytes.delete(k)
      removed++
    }
  }
  if (removed > 0) logger.info({ infoHash, removed }, 'cleared archive cache')
}
