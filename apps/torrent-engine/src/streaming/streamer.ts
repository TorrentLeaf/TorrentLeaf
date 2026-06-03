import type { FastifyReply, FastifyRequest } from 'fastify'
import { existsSync, createReadStream, statSync } from 'fs'
import { join } from 'path'
import { engine } from '../torrent/engine.js'
import { detectMime } from '../files/detector.js'
import { config } from '../config.js'
import { logger } from '../logger.js'

interface ParsedRange {
  start: number
  end: number
}

export function parseRange(header: string, total: number): ParsedRange | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match) return null
  const startStr = match[1]
  const endStr = match[2]

  let start: number
  let end: number
  if (startStr === '') {
    const suffix = Number(endStr)
    if (!Number.isFinite(suffix) || suffix <= 0) return null
    start = Math.max(0, total - suffix)
    end = total - 1
  } else {
    start = Number(startStr)
    end = endStr === '' ? total - 1 : Number(endStr)
  }

  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  if (start < 0 || end >= total || start > end) return null
  return { start, end }
}

/**
 * Resolve the absolute path of a torrent file on disk.
 * Returns null if the file does not exist or has zero size.
 */
function resolveDiskPath(file: { path: string }): string | null {
  const filePath = join(config.downloadPath, file.path)
  if (!existsSync(filePath)) return null
  try {
    const stat = statSync(filePath)
    if (stat.size === 0) return null
    return filePath
  } catch {
    return null
  }
}

export async function streamFile(
  req: FastifyRequest<{ Params: { infoHash: string; fileIndex: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const { infoHash, fileIndex } = req.params
  const torrent = engine.get(infoHash)
  if (!torrent) {
    reply.status(404).send({ error: 'torrent not found' })
    return
  }

  const index = Number(fileIndex)
  const file = torrent.files[index]
  if (!file) {
    reply.status(404).send({ error: 'file not found' })
    return
  }

  // Prioritize this file for download
  file.select(1)

  const mime = detectMime(file.name)
  const rangeHeader = req.headers.range

  // ── Strategy: prefer disk read over webtorrent stream ──────────
  // When a torrent is re-added via reseed, webtorrent's createReadStream()
  // may return empty even though the data is fully on disk. Reading directly
  // from the filesystem solves this for completed downloads.
  const diskPath = resolveDiskPath(file)

  if (diskPath) {
    const stat = statSync(diskPath)
    const total = stat.size

    // Use reply.raw to bypass Fastify's stream handling that overrides Content-Length
    reply.hijack()

    if (rangeHeader) {
      const parsed = parseRange(rangeHeader, total)
      if (!parsed) {
        reply.raw.writeHead(416, { 'Content-Range': `bytes */${total}` })
        reply.raw.end()
        return
      }
      const { start, end } = parsed
      reply.raw.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${total}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
        'Content-Type': mime,
        'Cache-Control': 'public, max-age=3600',
      })
      createReadStream(diskPath, { start, end: end + 1 }).pipe(reply.raw)
      return
    }

    reply.raw.writeHead(200, {
      'Content-Length': total,
      'Accept-Ranges': 'bytes',
      'Content-Type': mime,
      'Cache-Control': 'public, max-age=3600',
    })
    createReadStream(diskPath).pipe(reply.raw)
    return
  }
  // ── File not on disk — still downloading ────────────────────────
  // After engine reseed, webtorrent's createReadStream() returns empty data
  // even when progress=1. The only reliable way to stream is from disk.
  // Tell the client to retry later.
  file.select(2) // boost priority so it downloads faster
  logger.info({ filePath: file.path, progress: torrent.progress }, 'stream: file not on disk, returning 503')
  reply
    .status(503)
    .header('Retry-After', '5')
    .send({ error: 'file is still downloading', progress: torrent.progress })
}
