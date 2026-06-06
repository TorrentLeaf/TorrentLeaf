import { describe, it, expect, beforeEach, vi } from 'vitest'

// Pin a tiny cache cap (1 MB) before config.ts is evaluated so we can exercise
// byte-based eviction with small, fast buffers. vi.hoisted runs before imports.
vi.hoisted(() => {
  process.env.MAX_ARCHIVE_CACHE_MB = '1'
})

import {
  getCachedEntryBytes,
  getCachedListing,
  clearArchiveCache,
  type EntryBytes,
} from './archiveCache.js'
import type { ArchiveEntry } from './archive.js'

const KB = 1024
// All keys in this file are namespaced under these infoHashes so beforeEach can
// fully reset the module-global byte total between tests.
const HASHES = ['t', 'u', 'keep', 'drop', 'list', 'big']

function bytes(size: number): EntryBytes {
  return { buf: Buffer.alloc(size), mime: 'image/jpeg', name: 'p.jpg' }
}

const entry = (i: number): ArchiveEntry => ({
  index: i,
  name: `${i}.jpg`,
  size: 1,
  mimeType: 'image/jpeg',
})

beforeEach(() => {
  for (const h of HASHES) clearArchiveCache(h)
})

describe('getCachedEntryBytes', () => {
  it('runs the loader once and serves the cached bytes after', async () => {
    const loader = vi.fn(async () => bytes(100))
    const a = await getCachedEntryBytes('t:0:0', loader)
    const b = await getCachedEntryBytes('t:0:0', loader)
    expect(loader).toHaveBeenCalledTimes(1)
    expect(b).toBe(a)
  })

  it('dedupes concurrent loads of the same key', async () => {
    const loader = vi.fn(
      () => new Promise<EntryBytes>((r) => setTimeout(() => r(bytes(100)), 10)),
    )
    const [a, b] = await Promise.all([
      getCachedEntryBytes('t:0:1', loader),
      getCachedEntryBytes('t:0:1', loader),
    ])
    expect(loader).toHaveBeenCalledTimes(1)
    expect(a).toBe(b)
  })

  it('does not cache failures — the next call retries', async () => {
    const loader = vi.fn(async () => {
      throw new Error('boom')
    })
    await expect(getCachedEntryBytes('t:0:2', loader)).rejects.toThrow('boom')
    await expect(getCachedEntryBytes('t:0:2', loader)).rejects.toThrow('boom')
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('evicts the oldest entry once the byte cap is exceeded', async () => {
    // cap = 1 MB; three 400 KB pages total 1.2 MB, so inserting the third
    // evicts the first.
    const l0 = vi.fn(async () => bytes(400 * KB))
    const l1 = vi.fn(async () => bytes(400 * KB))
    const l2 = vi.fn(async () => bytes(400 * KB))
    await getCachedEntryBytes('t:0:0', l0)
    await getCachedEntryBytes('t:0:1', l1)
    await getCachedEntryBytes('t:0:2', l2) // pushes total over cap → evicts idx0

    await getCachedEntryBytes('t:0:1', l1) // still cached
    expect(l1).toHaveBeenCalledTimes(1)
    await getCachedEntryBytes('t:0:0', l0) // was evicted → reloaded
    expect(l0).toHaveBeenCalledTimes(2)
  })

  it('treats a cache hit as most-recently-used (LRU bump)', async () => {
    const a = vi.fn(async () => bytes(400 * KB))
    const b = vi.fn(async () => bytes(400 * KB))
    const c = vi.fn(async () => bytes(400 * KB))
    await getCachedEntryBytes('u:0:0', a)
    await getCachedEntryBytes('u:0:1', b)
    await getCachedEntryBytes('u:0:0', a) // hit → bumps idx0 ahead of idx1
    expect(a).toHaveBeenCalledTimes(1)

    await getCachedEntryBytes('u:0:2', c) // over cap → evicts the now-oldest idx1
    await getCachedEntryBytes('u:0:0', a) // idx0 survived the bump
    expect(a).toHaveBeenCalledTimes(1)
    await getCachedEntryBytes('u:0:1', b) // idx1 was evicted
    expect(b).toHaveBeenCalledTimes(2)
  })

  it('skips caching an entry larger than the whole cap', async () => {
    const loader = vi.fn(async () => bytes(2 * 1024 * KB)) // 2 MB > 1 MB cap
    await getCachedEntryBytes('big:0:0', loader)
    await getCachedEntryBytes('big:0:0', loader)
    expect(loader).toHaveBeenCalledTimes(2)
  })
})

describe('getCachedListing', () => {
  it('caches the listing and dedupes concurrent loads', async () => {
    const loader = vi.fn(async () => [entry(0), entry(1)])
    const [a, b] = await Promise.all([
      getCachedListing('list:0', loader),
      getCachedListing('list:0', loader),
    ])
    expect(loader).toHaveBeenCalledTimes(1)
    expect(a).toBe(b)
    await getCachedListing('list:0', loader) // served from cache
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('does not cache a failed listing', async () => {
    const loader = vi.fn(async () => {
      throw new Error('not ready')
    })
    await expect(getCachedListing('list:1', loader)).rejects.toThrow('not ready')
    await expect(getCachedListing('list:1', loader)).rejects.toThrow('not ready')
    expect(loader).toHaveBeenCalledTimes(2)
  })
})

describe('clearArchiveCache', () => {
  it('drops only the target torrent, leaving others cached', async () => {
    const keepBytes = vi.fn(async () => bytes(100))
    const dropBytes = vi.fn(async () => bytes(100))
    const dropList = vi.fn(async () => [entry(0)])

    await getCachedEntryBytes('keep:0:0', keepBytes)
    await getCachedEntryBytes('drop:0:0', dropBytes)
    await getCachedListing('drop:0', dropList)

    clearArchiveCache('drop')

    await getCachedEntryBytes('keep:0:0', keepBytes) // untouched
    expect(keepBytes).toHaveBeenCalledTimes(1)
    await getCachedEntryBytes('drop:0:0', dropBytes) // cleared → reloaded
    expect(dropBytes).toHaveBeenCalledTimes(2)
    await getCachedListing('drop:0', dropList) // cleared → reloaded
    expect(dropList).toHaveBeenCalledTimes(2)
  })
})
