import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { engine, type WTTorrent, type WTFile } from '../../torrent/engine.js'
import { logger } from '../../logger.js'

/**
 * /engine/probe/:infoHash/:fileIndex
 *   Returns the audio + subtitle stream layout of a video file.
 *
 * /engine/subtitles/:infoHash/:fileIndex/:streamIndex
 *   Streams a single subtitle track converted to WebVTT (for HTML <track>).
 *
 * Both require the file to be on disk; transmuxing already does so we keep
 * the same "503 + Retry-After" contract on cold cache misses.
 */

interface ProbeStream {
  // Absolute index inside the container (what ffmpeg -map uses).
  index: number
  codec: string
  language: string | null
  title: string | null
}

interface MediaInfo {
  audio: ProbeStream[]
  subtitles: ProbeStream[]
}

function resolveOnDisk(infoHash: string, fileIndexStr: string):
  | { ok: true; torrent: WTTorrent; file: WTFile; path: string }
  | { ok: false; status: number; message: string } {
  const torrent = engine.get(infoHash)
  if (!torrent) return { ok: false, status: 404, message: 'torrent not found' }
  const idx = Number(fileIndexStr)
  const file = torrent.files[idx]
  if (!file) return { ok: false, status: 404, message: 'file not found' }
  const diskPath = join(torrent.path, file.path)
  if (!existsSync(diskPath) || statSync(diskPath).size === 0) {
    return { ok: false, status: 503, message: 'file is still downloading' }
  }
  return { ok: true, torrent, file, path: diskPath }
}

interface FFProbeStream {
  index: number
  codec_type?: string
  codec_name?: string
  tags?: { language?: string; title?: string; LANGUAGE?: string; TITLE?: string }
}

function ffprobeStreams(filePath: string): Promise<FFProbeStream[]> {
  return new Promise((resolve) => {
    const proc = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'stream=index,codec_type,codec_name:stream_tags=language,title',
      '-of', 'json',
      filePath,
    ])
    let out = ''
    proc.stdout.on('data', (c: Buffer) => { out += c.toString() })
    proc.on('close', () => {
      try {
        const j = JSON.parse(out)
        resolve(Array.isArray(j.streams) ? j.streams : [])
      } catch {
        resolve([])
      }
    })
    proc.on('error', () => resolve([]))
  })
}

function toProbeStream(s: FFProbeStream): ProbeStream {
  const lang = s.tags?.language ?? s.tags?.LANGUAGE ?? null
  const title = s.tags?.title ?? s.tags?.TITLE ?? null
  return {
    index: s.index,
    codec: s.codec_name ?? 'unknown',
    language: lang,
    title,
  }
}

// Subtitle codecs ffmpeg can convert to WebVTT cleanly. Image-based formats
// (PGS=hdmv_pgs_subtitle, VobSub=dvd_subtitle) need OCR — skip them.
const TEXT_SUB_CODECS = new Set(['subrip', 'srt', 'ass', 'ssa', 'mov_text', 'webvtt'])

export async function registerMediaRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { infoHash: string; fileIndex: string } }>(
    '/engine/probe/:infoHash/:fileIndex',
    async (req, reply) => {
      const r = resolveOnDisk(req.params.infoHash, req.params.fileIndex)
      if (!r.ok) {
        reply.status(r.status).header('Retry-After', '5').send({ error: r.message })
        return
      }
      const streams = await ffprobeStreams(r.path)
      const info: MediaInfo = {
        audio: streams.filter((s) => s.codec_type === 'audio').map(toProbeStream),
        subtitles: streams
          .filter((s) => s.codec_type === 'subtitle' && TEXT_SUB_CODECS.has(s.codec_name ?? ''))
          .map(toProbeStream),
      }
      reply.send(info)
    },
  )

  app.get<{ Params: { infoHash: string; fileIndex: string; streamIndex: string } }>(
    '/engine/subtitles/:infoHash/:fileIndex/:streamIndex',
    async (req: FastifyRequest<{ Params: { infoHash: string; fileIndex: string; streamIndex: string } }>, reply: FastifyReply) => {
      const r = resolveOnDisk(req.params.infoHash, req.params.fileIndex)
      if (!r.ok) {
        reply.status(r.status).header('Retry-After', '5').send({ error: r.message })
        return
      }
      const streamIdx = Number(req.params.streamIndex)
      if (!Number.isInteger(streamIdx) || streamIdx < 0) {
        reply.status(400).send({ error: 'invalid streamIndex' })
        return
      }

      logger.info({ file: r.file.name, streamIdx }, 'extracting subtitle to webvtt')

      const ffmpeg = spawn('ffmpeg', [
        '-loglevel', 'error',
        '-i', r.path,
        '-map', `0:${streamIdx}`,
        '-c:s', 'webvtt',
        '-f', 'webvtt',
        'pipe:1',
      ], { stdio: ['ignore', 'pipe', 'pipe'] })

      ffmpeg.stderr.on('data', (d: Buffer) => {
        logger.warn({ msg: d.toString().trim() }, 'ffmpeg subtitle stderr')
      })
      req.raw.on('close', () => ffmpeg.kill('SIGTERM'))

      reply.hijack()
      reply.raw.writeHead(200, {
        'Content-Type': 'text/vtt; charset=utf-8',
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'public, max-age=3600',
      })
      ffmpeg.stdout.pipe(reply.raw)
      ffmpeg.stdout.on('end', () => reply.raw.end())
    },
  )
}
