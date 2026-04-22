import { describe, it, expect } from 'vitest'
import {
  detectMime,
  classifyFile,
  isBlocked,
  isSafePath,
  analyzeFiles,
} from './detector.js'

describe('detectMime', () => {
  it.each([
    ['a.jpg', 'image/jpeg'],
    ['A.JPEG', 'image/jpeg'],
    ['cover.png', 'image/png'],
    ['p.webp', 'image/webp'],
    ['p.avif', 'image/avif'],
    ['anim.gif', 'image/gif'],
    ['book.pdf', 'application/pdf'],
    ['novel.epub', 'application/epub+zip'],
    ['ch1.cbz', 'application/vnd.comicbook+zip'],
    ['ch2.cbr', 'application/vnd.comicbook-rar'],
    ['pack.zip', 'application/zip'],
  ])('maps %s to %s', (name, mime) => {
    expect(detectMime(name)).toBe(mime)
  })

  it('falls back to octet-stream for unknown extensions', () => {
    expect(detectMime('random.xyz')).toBe('application/octet-stream')
    expect(detectMime('no-extension')).toBe('application/octet-stream')
  })
})

describe('classifyFile', () => {
  it.each([
    ['a.jpg', 'image'],
    ['b.PNG', 'image'],
    ['book.pdf', 'pdf'],
    ['ch1.epub', 'epub'],
    ['ch1.cbz', 'cbz'],
    ['ch1.cbr', 'cbr'],
    ['pack.zip', 'zip'],
  ])('classifies %s as %s', (name, type) => {
    expect(classifyFile(name)).toBe(type)
  })

  it('returns unknown for unsupported extensions', () => {
    expect(classifyFile('readme.txt')).toBe('unknown')
    expect(classifyFile('no-extension')).toBe('unknown')
  })
})

describe('isBlocked', () => {
  it.each([
    '.exe', '.sh', '.bash', '.zsh', '.bat', '.cmd', '.ps1',
    '.msi', '.dmg', '.pkg', '.deb', '.rpm', '.appimage',
    '.vbs', '.js', '.ts', '.py', '.rb', '.pl',
  ])('rejects %s', (ext) => {
    expect(isBlocked('evil' + ext)).toBe(true)
  })

  it('blocks regardless of case', () => {
    expect(isBlocked('EVIL.EXE')).toBe(true)
  })

  it('does not block benign extensions', () => {
    expect(isBlocked('cover.jpg')).toBe(false)
    expect(isBlocked('book.pdf')).toBe(false)
    expect(isBlocked('ch.cbz')).toBe(false)
  })
})

describe('isSafePath', () => {
  it('accepts a nested safe path', () => {
    expect(isSafePath('chapters/01/page-1.jpg')).toBe(true)
  })

  it('rejects parent traversal segments', () => {
    expect(isSafePath('../etc/passwd')).toBe(false)
    expect(isSafePath('../../etc/passwd')).toBe(false)
  })

  it('allows paths that normalize cleanly even with internal ..', () => {
    // 'a/../b' normalizes to 'b' which is a safe relative path
    expect(isSafePath('a/../b')).toBe(true)
  })

  it('rejects absolute paths', () => {
    expect(isSafePath('/etc/passwd')).toBe(false)
  })
})

describe('analyzeFiles', () => {
  const fakeTorrent = {
    files: [
      { name: 'ch01.cbz', path: 'pack/ch01.cbz', length: 1000 },
      { name: 'evil.exe', path: 'pack/evil.exe', length: 100 },
      { name: 'cover.jpg', path: 'pack/cover.jpg', length: 500 },
      { name: 'leak.txt', path: '../leak.txt', length: 50 },
    ],
  } as unknown as import('../torrent/engine.js').WTTorrent

  it('filters blocked extensions and unsafe paths', () => {
    const results = analyzeFiles(fakeTorrent)
    const names = results.map((r) => r.name)
    expect(names).toContain('ch01.cbz')
    expect(names).toContain('cover.jpg')
    expect(names).not.toContain('evil.exe')
    expect(names).not.toContain('leak.txt')
  })

  it('preserves original index positions', () => {
    const results = analyzeFiles(fakeTorrent)
    const cbz = results.find((r) => r.name === 'ch01.cbz')
    const jpg = results.find((r) => r.name === 'cover.jpg')
    expect(cbz?.index).toBe(0)
    expect(jpg?.index).toBe(2)
  })

  it('populates mime and file type fields', () => {
    const [first] = analyzeFiles(fakeTorrent)
    expect(first.mimeType).toBe('application/vnd.comicbook+zip')
    expect(first.fileType).toBe('cbz')
  })
})
