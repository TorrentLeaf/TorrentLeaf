import { describe, it, expect, vi, beforeEach } from 'vitest'
import { existsSync, statSync, createReadStream } from 'fs'
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

// ── streamFile (integration with engine + fs mocks) ─────────────────────
// streamFile reads completed files straight from disk (see streamer.ts): it
// resolves <torrent.path>/<file.path>, hijacks the reply and writes to
// reply.raw, falling back to a 503 retry when the file isn't on disk yet.

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  statSync: vi.fn(),
  createReadStream: vi.fn(),
}))

const fakeFile = {
  name: 'chapter01.cbz',
  path: 'chapter01.cbz',
  length: 2000,
  select: vi.fn(),
}

const fakeTorrent = {
  path: '/data/torrents/known',
  files: [fakeFile],
}

const DISK_PATH = '/data/torrents/known/chapter01.cbz'

vi.mock('../torrent/engine.js', () => ({
  engine: {
    get: vi.fn((hash: string) => (hash === 'known-hash' ? fakeTorrent : undefined)),
  },
}))

/** Pretend the file is fully on disk; returns the pipe mock of its read stream. */
function fileOnDisk(size = 2000) {
  vi.mocked(existsSync).mockReturnValue(true)
  vi.mocked(statSync).mockReturnValue({ size } as unknown as ReturnType<typeof statSync>)
  const pipe = vi.fn()
  vi.mocked(createReadStream).mockReturnValue(
    { pipe } as unknown as ReturnType<typeof createReadStream>,
  )
  return pipe
}

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
  const raw = { writeHead: vi.fn(), end: vi.fn() }
  const reply: Record<string, unknown> = { raw }
  reply.status = vi.fn(() => reply)
  reply.header = vi.fn(() => reply)
  reply.send = vi.fn(() => reply)
  reply.hijack = vi.fn(() => reply)
  return reply as unknown as Parameters<typeof streamFile>[1] & {
    raw: typeof raw
    status: ReturnType<typeof vi.fn>
    header: ReturnType<typeof vi.fn>
    send: ReturnType<typeof vi.fn>
    hijack: ReturnType<typeof vi.fn>
  }
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

  it('streams 200 with the full file from disk when no Range header', async () => {
    const reply = makeReply()
    const pipe = fileOnDisk(2000)
    await streamFile(makeReq(), reply)
    expect(fakeFile.select).toHaveBeenCalledWith(1)
    expect(reply.hijack).toHaveBeenCalled()
    expect(reply.raw.writeHead).toHaveBeenCalledWith(
      200,
      expect.objectContaining({
        'Content-Length': 2000,
        'Accept-Ranges': 'bytes',
        'Content-Type': 'application/vnd.comicbook+zip',
      }),
    )
    expect(createReadStream).toHaveBeenCalledWith(DISK_PATH)
    expect(pipe).toHaveBeenCalledWith(reply.raw)
  })

  it('streams 206 with partial content on a valid Range', async () => {
    const reply = makeReply()
    const pipe = fileOnDisk(2000)
    await streamFile(makeReq({ headers: { range: 'bytes=0-499' } }), reply)
    expect(reply.raw.writeHead).toHaveBeenCalledWith(
      206,
      expect.objectContaining({
        'Content-Range': 'bytes 0-499/2000',
        'Content-Length': 500,
      }),
    )
    // createReadStream end is exclusive in the streamer, so end = 499 + 1.
    expect(createReadStream).toHaveBeenCalledWith(DISK_PATH, { start: 0, end: 500 })
    expect(pipe).toHaveBeenCalledWith(reply.raw)
  })

  it('returns 416 on an invalid Range header', async () => {
    const reply = makeReply()
    fileOnDisk(2000)
    await streamFile(makeReq({ headers: { range: 'bytes=9999-0' } }), reply)
    expect(reply.raw.writeHead).toHaveBeenCalledWith(416, { 'Content-Range': 'bytes */2000' })
    expect(reply.raw.end).toHaveBeenCalled()
  })

  it('returns 503 with Retry-After when the file is not yet on disk', async () => {
    const reply = makeReply()
    vi.mocked(existsSync).mockReturnValue(false)
    await streamFile(makeReq(), reply)
    expect(fakeFile.select).toHaveBeenCalledWith(2) // boost priority
    expect(reply.status).toHaveBeenCalledWith(503)
    expect(reply.header).toHaveBeenCalledWith('Retry-After', '5')
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'file is still downloading' }),
    )
  })
})
