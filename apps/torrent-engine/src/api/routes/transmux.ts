import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { existsSync, statSync } from 'fs'
import { join } from 'path'
import { spawn } from 'child_process'
import { engine } from '../../torrent/engine.js'
import { logger } from '../../logger.js'

/**
 * /engine/transmux/:infoHash/:fileIndex
 *
 * Repackages (and, when needed, re-encodes) a video file into fragmented
 * MP4 on-the-fly via ffmpeg so the browser can play it in a <video> element.
 *
 * Source codec is probed first: 8-bit H.264 is copied as-is (zero-CPU);
 * everything else (HEVC/H.265, VP9, AV1, 10-bit H.264 like Hi10P) is
 * re-encoded to baseline H.264 because no major browser plays those codecs
 * inside MP4. Audio is always re-encoded to AAC for the same reason
 * (handles EAC3/DTS/FLAC sources).
 */

interface VideoProbe {
  codec: string | null
  pixFmt: string | null
}

function probeVideo(filePath: string): Promise<VideoProbe> {
  return new Promise((resolve) => {
    const proc = spawn('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=codec_name,pix_fmt',
      '-of', 'json',
      filePath,
    ])
    let out = ''
    proc.stdout.on('data', (d: Buffer) => {
      out += d.toString()
    })
    proc.on('close', () => {
      try {
        const j = JSON.parse(out)
        const s = j.streams?.[0] ?? {}
        resolve({ codec: s.codec_name ?? null, pixFmt: s.pix_fmt ?? null })
      } catch {
        resolve({ codec: null, pixFmt: null })
      }
    })
    proc.on('error', () => resolve({ codec: null, pixFmt: null }))
  })
}

function videoArgs(probe: VideoProbe): string[] {
  const browserSafePixFmts = new Set(['yuv420p', 'yuvj420p'])
  if (probe.codec === 'h264' && probe.pixFmt !== null && browserSafePixFmts.has(probe.pixFmt)) {
    return ['-c:v', 'copy']
  }
  return [
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
  ]
}

export async function registerTransmuxRoutes(app: FastifyInstance): Promise<void> {
  app.get<{
    Params: { infoHash: string; fileIndex: string }
    Querystring: { audio?: string }
  }>(
    '/engine/transmux/:infoHash/:fileIndex',
    async (
      req: FastifyRequest<{
        Params: { infoHash: string; fileIndex: string }
        Querystring: { audio?: string }
      }>,
      reply: FastifyReply,
    ) => {
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

      file.select(2)

      const diskPath = join(torrent.path, file.path)
      const onDisk = existsSync(diskPath) && statSync(diskPath).size > 0

      if (!onDisk) {
        reply
          .status(503)
          .header('Retry-After', '5')
          .send({ error: 'video file is still downloading' })
        return
      }

      const probe = await probeVideo(diskPath)
      const vArgs = videoArgs(probe)

      // Audio selection: ?audio=<absoluteStreamIndex> picks a specific track
      // (multi-language MKVs expose several). Default to the first audio
      // stream when no override is given.
      const audioIdxRaw = req.query.audio
      const audioIdx = audioIdxRaw !== undefined && /^\d+$/.test(audioIdxRaw)
        ? Number(audioIdxRaw)
        : null
      const audioMap = audioIdx !== null ? `0:${audioIdx}` : '0:a:0'

      logger.info(
        {
          infoHash, fileIndex: index, name: file.name,
          codec: probe.codec, pixFmt: probe.pixFmt,
          transcode: vArgs[1] !== 'copy',
          audioMap,
        },
        'starting transmux',
      )

      const ffmpeg = spawn('ffmpeg', [
        '-loglevel', 'error',
        '-i', diskPath,
        '-map', '0:v:0',
        '-map', audioMap,
        ...vArgs,
        '-c:a', 'aac',
        '-b:a', '192k',
        '-ac', '2',
        '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
        '-f', 'mp4',
        'pipe:1',
      ], {
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      ffmpeg.stderr.on('data', (data: Buffer) => {
        const msg = data.toString()
        if (msg.includes('Error') || msg.includes('error')) {
          logger.warn({ infoHash, msg: msg.trim() }, 'ffmpeg stderr')
        }
      })

      ffmpeg.on('error', (err) => {
        logger.error({ err, infoHash }, 'ffmpeg process error')
      })

      ffmpeg.on('close', (code) => {
        if (code !== 0 && code !== null) {
          logger.warn({ infoHash, code }, 'ffmpeg exited with non-zero code')
        }
      })

      req.raw.on('close', () => {
        ffmpeg.kill('SIGTERM')
      })

      // Bypass Fastify's reply.send(stream) path: the onSend hook + the
      // length-zero short-circuit when the stream hasn't emitted yet
      // produces an empty response. Write headers manually and pipe
      // ffmpeg.stdout straight to the raw socket.
      reply.hijack()
      reply.raw.writeHead(200, {
        'Content-Type': 'video/mp4',
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      })
      ffmpeg.stdout.pipe(reply.raw)
      ffmpeg.stdout.on('end', () => reply.raw.end())
    },
  )
}
