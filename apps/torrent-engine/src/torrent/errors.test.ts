import { describe, it, expect } from 'vitest'
import { AddTorrentError } from './errors.js'

describe('AddTorrentError', () => {
  it('carries a machine-readable code', () => {
    const err = new AddTorrentError('insufficient_disk', 'not enough free disk space (2.5 GB free, minimum 5 GB)')
    expect(err).toBeInstanceOf(Error)
    expect(err.code).toBe('insufficient_disk')
    expect(err.message).toContain('2.5 GB free')
  })
})
