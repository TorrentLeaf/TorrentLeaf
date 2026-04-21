import type { Readable } from 'node:stream'
import type { FastifyInstance, FastifyReply } from 'fastify'
import { engine, type WTFile } from '../../torrent/engine.js'
import { classifyFile } from '../../files/detector.js'
import { listCbzEntries, openCbzEntry } from '../../files/archive.js'

// Drains an entire Readable into a Buffer. We use it for CBZ entries rather
// than streaming directly to Fastify's reply because yauzl's read streams are
// finicky when piped through the reply serializer — races between the async
// callback resolution and the stream's first 'data' event produced
// zero-byte responses. Buffering is safe: comic pages are single-digit MBs.
function streamToBuffer(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    stream.on('data', (chunk: Buffer) => chunks.push(chunk))
    stream.once('end', () => resolve(Buffer.concat(chunks)))
    stream.once('error', reject)
  })
}

type ResolveOk = { kind: 'ok'; file: WTFile }
type ResolveErr = { kind: 'err'; status: number; message: string }

// If reading the zip central directory takes longer than this, assume the
// tail pieces aren't available yet and tell the caller to retry.
const ARCHIVE_READ_TIMEOUT_MS = 15_000

function resolveArchiveFile(infoHash: string, fileIndexStr: string): ResolveOk | ResolveErr {
  const torrent = engine.get(infoHash)
  if (!torrent) return { kind: 'err', status: 404, message: 'torrent not found' }
  if (!torrent.ready) {
    return { kind: 'err', status: 503, message: 'torrent metadata not ready' }
  }
  const idx = Number(fileIndexStr)
  if (!Number.isInteger(idx) || idx < 0) {
    return { kind: 'err', status: 400, message: 'invalid file index' }
  }
  const file = torrent.files[idx]
  if (!file) return { kind: 'err', status: 404, message: 'file not found' }
  const type = classifyFile(file.name)
  if (type !== 'cbz' && type !== 'zip') {
    return { kind: 'err', status: 415, message: `not a cbz archive (type: ${type})` }
  }
  return { kind: 'ok', file }
}

function withTimeout<T>(p: Promise<T>, ms: number, tag: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${tag} timeout after ${ms}ms`)), ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (err) => {
        clearTimeout(t)
        reject(err)
      },
    )
  })
}

function sendResolveError(reply: FastifyReply, err: ResolveErr): void {
  reply.status(err.status).send({ error: err.message })
}

export async function registerArchiveRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { infoHash: string; fileIndex: string } }>(
    '/engine/archive/:infoHash/:fileIndex/entries',
    async (req, reply) => {
      const r = resolveArchiveFile(req.params.infoHash, req.params.fileIndex)
      if (r.kind === 'err') return sendResolveError(reply, r)
      // Prioritize this file so the central directory (end of file) and the
      // entries we subsequently stream can be satisfied from the swarm.
      r.file.select(1)
      try {
        const entries = await withTimeout(
          listCbzEntries(r.file),
          ARCHIVE_READ_TIMEOUT_MS,
          'list entries',
        )
        reply.send(entries)
      } catch (err) {
        app.log.warn({ err }, 'failed to list cbz entries')
        // Assume transient: tail pieces still in flight from the swarm.
        reply.status(503).send({ error: 'archive not ready, retry' })
      }
    },
  )

  app.get<{ Params: { infoHash: string; fileIndex: string; entryIndex: string } }>(
    '/engine/archive/:infoHash/:fileIndex/entry/:entryIndex',
    async (req, reply) => {
      const r = resolveArchiveFile(req.params.infoHash, req.params.fileIndex)
      if (r.kind === 'err') return sendResolveError(reply, r)

      const entryIdx = Number(req.params.entryIndex)
      if (!Number.isInteger(entryIdx) || entryIdx < 0) {
        reply.status(400).send({ error: 'invalid entryIndex' })
        return
      }

      r.file.select(1)
      try {
        const entry = await withTimeout(
          openCbzEntry(r.file, entryIdx),
          ARCHIVE_READ_TIMEOUT_MS,
          'open entry',
        )
        const body = await withTimeout(
          streamToBuffer(entry.stream),
          ARCHIVE_READ_TIMEOUT_MS,
          'drain entry',
        )
        reply
          .status(200)
          .headers({
            'Content-Type': entry.mime,
            'Content-Length': String(body.length),
            'Cache-Control': 'public, max-age=3600',
          })
          .send(body)
      } catch (err) {
        app.log.warn({ err }, 'failed to open cbz entry')
        reply.status(503).send({ error: 'archive entry not ready, retry' })
      }
    },
  )
}
