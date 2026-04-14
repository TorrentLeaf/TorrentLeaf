import type { FastifyReply, FastifyRequest } from 'fastify'
import { engine } from '../torrent/engine.js'
import { detectMime } from '../files/detector.js'

interface ParsedRange {
  start: number
  end: number
}

function parseRange(header: string, total: number): ParsedRange | null {
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

  file.select(1)

  const mime = detectMime(file.name)
  const total = file.length
  const rangeHeader = req.headers.range

  if (rangeHeader) {
    const parsed = parseRange(rangeHeader, total)
    if (!parsed) {
      reply.status(416).header('Content-Range', `bytes */${total}`).send()
      return
    }
    const { start, end } = parsed
    reply
      .status(206)
      .headers({
        'Content-Range': `bytes ${start}-${end}/${total}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(end - start + 1),
        'Content-Type': mime,
        'Cache-Control': 'public, max-age=3600',
      })
      .send(file.createReadStream({ start, end }))
    return
  }

  reply
    .status(200)
    .headers({
      'Content-Length': String(total),
      'Accept-Ranges': 'bytes',
      'Content-Type': mime,
    })
    .send(file.createReadStream())
}
