import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parseRange, streamFile } from './streamer.js'

// ── parseRange (pure function — no mocks needed) ────────────────────────

describe('parseRange', () => {
  const total = 1000

  it('parses a normal byte range', () => {
    expect(parseRange('bytes=0-499', total)).toEqual({ start: 0, end: 499 })
  })

  it('parses an open-end range (bytes=500-)', () => {
    expect(parseRange('bytes=500-', total)).toEqual({ start: 500, end: 999 })
  })

  it('parses a suffix range (bytes=-200)', () => {
    expect(parseRange('bytes=-200', total)).toEqual({ start: 800, end: 999 })
  })

  it('clamps suffix range that exceeds total', () => {
    expect(parseRange('bytes=-5000', total)).toEqual({ start: 0, end: 999 })
  })

  it('rejects non-bytes prefix', () => {
    expect(parseRange('chunks=0-100', total)).toBeNull()
  })

  it('rejects multi-range', () => {
    expect(parseRange('bytes=0-100, 200-300', total)).toBeNull()
  })

  it('rejects empty header', () => {
    expect(parseRange('', total)).toBeNull()
  })

  it('rejects start > end', () => {
    expect(parseRange('bytes=500-100', total)).toBeNull()
  })

  it('rejects end >= total', () => {
    expect(parseRange('bytes=0-1000', total)).toBeNull()
  })

  it('rejects negative suffix of 0', () => {
    expect(parseRange('bytes=-0', total)).toBeNull()
  })

  it('handles whitespace around header', () => {
    expect(parseRange('  bytes=10-20  ', total)).toEqual({ start: 10, end: 20 })
  })

  it('rejects non-numeric values', () => {
    expect(parseRange('bytes=abc-def', total)).toBeNull()
  })
})

// ── streamFile (integration with engine mock) ───────────────────────────

// We need to mock the engine singleton so we don't start a real WebTorrent client
const fakeStream = { pipe: vi.fn() } // stand-in for ReadableStream
const fakeFile = {
  name: 'chapter01.cbz',
  length: 2000,
  select: vi.fn(),
  createReadStream: vi.fn(() => fakeStream),
}

const fakeTorrent = {
  files: [fakeFile],
}

vi.mock('../torrent/engine.js', () => ({
  engine: {
    get: vi.fn((hash: string) => (hash === 'known-hash' ? fakeTorrent : undefined)),
  },
}))

function makeReq(overrides: Partial<{
  params: { infoHash: string; fileIndex: string }
  headers: Record<string, string>
}> = {}) {
  return {
    params: { infoHash: 'known-hash', fileIndex: '0', ...overrides.params },
    headers: { ...overrides.headers },
  } as unknown as Parameters<typeof streamFile>[0]
}

function makeReply() {
  const reply: Record<string, unknown> = {}
  reply.status = vi.fn(() => reply)
  reply.header = vi.fn(() => reply)
  reply.headers = vi.fn(() => reply)
  reply.send = vi.fn(() => reply)
  return reply as unknown as Parameters<typeof streamFile>[1]
}

describe('streamFile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 404 when torrent is not found', async () => {
    const reply = makeReply()
    await streamFile(makeReq({ params: { infoHash: 'missing', fileIndex: '0' } }), reply)
    expect(reply.status).toHaveBeenCalledWith(404)
    expect(reply.send).toHaveBeenCalledWith({ error: 'torrent not found' })
  })

  it('returns 404 when file index is out of bounds', async () => {
    const reply = makeReply()
    await streamFile(makeReq({ params: { infoHash: 'known-hash', fileIndex: '99' } }), reply)
    expect(reply.status).toHaveBeenCalledWith(404)
    expect(reply.send).toHaveBeenCalledWith({ error: 'file not found' })
  })

  it('returns 200 with full file when no Range header', async () => {
    const reply = makeReply()
    await streamFile(makeReq(), reply)
    expect(fakeFile.select).toHaveBeenCalledWith(1)
    expect(reply.status).toHaveBeenCalledWith(200)
    expect(reply.headers).toHaveBeenCalledWith(
      expect.objectContaining({
        'Content-Length': '2000',
        'Accept-Ranges': 'bytes',
        'Content-Type': 'application/vnd.comicbook+zip',
      }),
    )
    expect(fakeFile.createReadStream).toHaveBeenCalledWith()
  })

  it('returns 206 with partial content on valid Range', async () => {
    const reply = makeReply()
    await streamFile(makeReq({ headers: { range: 'bytes=0-499' } }), reply)
    expect(reply.status).toHaveBeenCalledWith(206)
    expect(reply.headers).toHaveBeenCalledWith(
      expect.objectContaining({
        'Content-Range': 'bytes 0-499/2000',
        'Content-Length': '500',
      }),
    )
    expect(fakeFile.createReadStream).toHaveBeenCalledWith({ start: 0, end: 499 })
  })

  it('returns 416 on invalid Range header', async () => {
    const reply = makeReply()
    await streamFile(makeReq({ headers: { range: 'bytes=9999-0' } }), reply)
    expect(reply.status).toHaveBeenCalledWith(416)
    expect(reply.header).toHaveBeenCalledWith('Content-Range', 'bytes */2000')
  })
})
