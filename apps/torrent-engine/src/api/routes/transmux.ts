import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { existsSync, statSync, mkdirSync, renameSync, createReadStream, unlink } from 'fs'
import { join, dirname } from 'path'
import { spawn } from 'child_process'
import { engine } from '../../torrent/engine.js'
import { config } from '../../config.js'
import { parseRange } from '../../streaming/streamer.js'
import { probeVideo, videoArgs } from '../../files/video.js'
import { logger } from '../../logger.js'

/**
 * /engine/transmux/:infoHash/:fileIndex
 *
 * Repackages (and, when needed, re-encodes) a video file into a *complete,
 * seekable* MP4 via ffmpeg, caches it on disk, and serves it with HTTP Range
 * support so the browser gets a real duration and instant seeking.
 *
 * Why not stream ffmpeg.stdout live? A live fragmented-MP4 pipe has no moov
 * duration (the player's total time grows as bytes arrive) and no Range
 * support (any seek or buffer underrun forces the player to reopen the
 * stream, restarting ffmpeg from t=0 — which stalls). Transcoding once to a
 * faststart MP4 fixes both: known duration + native seeking + no re-encode
 * on every request.
 *
 * Flow on a cache miss: kick off ffmpeg writing to `<cache>.part`, return
 * 503 + Retry-After, and let the client poll until the file is ready (same
 * contract as the still-downloading case). On success the `.part` is renamed
 * atomically to its final name; subsequent requests serve it via Range.
 *
 * Source codec is probed first: 8-bit H.264 is copied as-is (zero-CPU);
 * everything else (HEVC/H.265, VP9, AV1, 10-bit H.264 like Hi10P) is
 * re-encoded to baseline H.264. Audio is always re-encoded to AAC (handles
 * EAC3/DTS/FLAC sources).
 */

// In-flight transcodes keyed by cache filename, so concurrent requests for
// the same output don't spawn duplicate ffmpeg processes.
const inProgress = new Set<string>()

/** Absolute path of the cached transcode for a given file + audio track. */
function cachePathFor(infoHash: string, fileIndex: number, audioIdx: number | null): string {
  const audioKey = audioIdx !== null ? `a${audioIdx}` : 'adef'
  return join(config.downloadPath, '.transcode', `${infoHash}.${fileIndex}.${audioKey}.mp4`)
}

/** Serve a complete file on disk with Range support (mirrors the streamer). */
function serveWithRange(reply: FastifyReply, rangeHeader: string | undefined, filePath: string): void {
  const total = statSync(filePath).size
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
      'Content-Type': 'video/mp4',
      'Cache-Control': 'public, max-age=3600',
    })
    createReadStream(filePath, { start, end: end + 1 }).pipe(reply.raw)
    return
  }

  reply.raw.writeHead(200, {
    'Content-Length': total,
    'Accept-Ranges': 'bytes',
    'Content-Type': 'video/mp4',
    'Cache-Control': 'public, max-age=3600',
  })
  createReadStream(filePath).pipe(reply.raw)
}

/**
 * Spawn ffmpeg to transcode `srcPath` into a complete faststart MP4 at
 * `finalPath`. Writes to `<finalPath>.part` first and renames atomically on
 * success so a partial file is never served. Registration in `inProgress`
 * must already have happened before calling this.
 */
async function startTranscode(
  infoHash: string,
  name: string,
  srcPath: string,
  finalPath: string,
  cacheKey: string,
  audioMap: string,
): Promise<void> {
  const probe = await probeVideo(srcPath)
  const vArgs = videoArgs(probe)
  const partPath = `${finalPath}.part`

  logger.info(
    {
      infoHash, name, codec: probe.codec, pixFmt: probe.pixFmt,
      transcode: vArgs[1] !== 'copy', audioMap, finalPath,
    },
    'starting transcode to seekable mp4',
  )

  const ffmpeg = spawn('ffmpeg', [
    '-loglevel', 'error',
    '-i', srcPath,
    '-map', '0:v:0',
    '-map', audioMap,
    ...vArgs,
    '-c:a', 'aac',
    '-b:a', '192k',
    '-ac', '2',
    '-movflags', '+faststart',
    '-f', 'mp4',
    '-y',
    partPath,
  ], {
    stdio: ['ignore', 'ignore', 'pipe'],
  })

  let stderr = ''
  ffmpeg.stderr.on('data', (d: Buffer) => {
    stderr += d.toString()
  })

  ffmpeg.on('error', (err) => {
    logger.error({ err, infoHash }, 'ffmpeg process error')
    inProgress.delete(cacheKey)
    unlink(partPath, () => {})
  })

  ffmpeg.on('close', (code) => {
    inProgress.delete(cacheKey)
    if (code === 0) {
      try {
        renameSync(partPath, finalPath)
        logger.info({ infoHash, finalPath }, 'transcode complete')
      } catch (err) {
        logger.error({ err, infoHash }, 'failed to finalize transcode')
        unlink(partPath, () => {})
      }
    } else {
      logger.warn({ infoHash, code, stderr: stderr.trim() }, 'ffmpeg exited with non-zero code')
      unlink(partPath, () => {})
    }
  })
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

      // Audio selection: ?audio=<absoluteStreamIndex> picks a specific track
      // (multi-language MKVs expose several). Default to the first audio
      // stream when no override is given.
      const audioIdxRaw = req.query.audio
      const audioIdx = audioIdxRaw !== undefined && /^\d+$/.test(audioIdxRaw)
        ? Number(audioIdxRaw)
        : null
      const audioMap = audioIdx !== null ? `0:${audioIdx}` : '0:a:0'

      const finalPath = cachePathFor(infoHash, index, audioIdx)
      const cacheKey = `${infoHash}.${index}.${audioIdx ?? 'def'}`

      // ── Cache hit: serve the finished, seekable MP4 via Range ──────
      if (existsSync(finalPath)) {
        serveWithRange(reply, req.headers.range, finalPath)
        return
      }

      // ── Transcode in flight: tell the client to retry ─────────────
      if (inProgress.has(cacheKey)) {
        reply.status(503).header('Retry-After', '3').send({ error: 'video is being prepared' })
        return
      }

      // ── Need the *complete* source on disk before transcoding ─────
      // A partial source would produce a truncated cache that we'd serve
      // forever, so require the full file (not just size > 0 like the raw
      // streamer).
      const diskPath = join(torrent.path, file.path)
      const complete = existsSync(diskPath) && statSync(diskPath).size >= file.length
      if (!complete) {
        reply
          .status(503)
          .header('Retry-After', '5')
          .send({ error: 'video file is still downloading', progress: torrent.progress })
        return
      }

      // ── Cache miss: reserve the slot synchronously, then kick off
      // ffmpeg in the background and ask the client to poll. Reserving
      // before any await prevents a duplicate spawn from a racing request.
      inProgress.add(cacheKey)
      mkdirSync(dirname(finalPath), { recursive: true })
      void startTranscode(infoHash, file.name, diskPath, finalPath, cacheKey, audioMap)

      reply.status(503).header('Retry-After', '3').send({ error: 'video is being prepared' })
    },
  )
}
