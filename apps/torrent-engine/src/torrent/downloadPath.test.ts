import { describe, it, expect } from 'vitest'
import { resolveDownloadPath } from './downloadPath.js'
import { AddTorrentError } from './errors.js'

const BASE = '/data/torrents'

describe('resolveDownloadPath', () => {
  it('returns the base when no subpath is given', () => {
    expect(resolveDownloadPath(BASE)).toBe(BASE)
  })
  it('joins a simple relative subfolder', () => {
    expect(resolveDownloadPath(BASE, 'one-piece')).toBe('/data/torrents/one-piece')
  })
  it('normalizes nested subfolders', () => {
    expect(resolveDownloadPath(BASE, 'manga/one-piece')).toBe('/data/torrents/manga/one-piece')
  })
  it('rejects parent-traversal', () => {
    expect(() => resolveDownloadPath(BASE, '../etc')).toThrow(AddTorrentError)
  })
  it('rejects absolute paths', () => {
    expect(() => resolveDownloadPath(BASE, '/etc/passwd')).toThrow(AddTorrentError)
  })
  it('rejects sneaky traversal that escapes after normalization', () => {
    expect(() => resolveDownloadPath(BASE, 'a/../../b')).toThrow(AddTorrentError)
  })
})
