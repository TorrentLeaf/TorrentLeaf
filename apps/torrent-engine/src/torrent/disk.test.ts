import { describe, it, expect } from 'vitest'
import { assertDiskAvailable } from './disk.js'
import { AddTorrentError } from './errors.js'
import { config } from '../config.js'

const GB = 1024 ** 3
// Effectively no free space (1 byte) — below any configured free-space floor,
// so the test holds regardless of the container's MIN_FREE_DISK_GB override.
const lowFree = () => ({ bavail: 1, bsize: 1 })

describe('assertDiskAvailable', () => {
  it('throws insufficient_disk below the free-space floor on a normal add', () => {
    let caught: unknown
    try {
      assertDiskAvailable('/data', {}, { statfs: lowFree, usedBytes: () => 0 })
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(AddTorrentError)
    expect((caught as AddTorrentError).code).toBe('insufficient_disk')
  })

  it('skips the free-space floor when reseed=true', () => {
    expect(() =>
      assertDiskAvailable('/data', { reseed: true }, { statfs: lowFree, usedBytes: () => 0 }),
    ).not.toThrow()
  })

  it('still enforces disk_budget even when reseed=true', () => {
    const overBudget = () => (config.maxDiskGB + 1) * GB
    let caught: unknown
    try {
      assertDiskAvailable('/data', { reseed: true }, { statfs: lowFree, usedBytes: overBudget })
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(AddTorrentError)
    expect((caught as AddTorrentError).code).toBe('disk_budget')
  })
})
