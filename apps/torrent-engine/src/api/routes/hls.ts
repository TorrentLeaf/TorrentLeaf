import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { existsSync, statSync, mkdirSync, renameSync, createReadStream, unlink } from 'node:fs'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { engine, type WTTorrent, type WTFile } from '../../torrent/engine.js'
import { probeVideo, videoArgs } from '../../files/video.js'
import { hlsSegmentDir, enforceCacheLimit } from '../../files/transcodeCache.js'
import { logger } from '../../logger.js'

/**
 * On-demand HLS transcoding for videos that need re-encoding (HEVC, VP9, AV1,
 * 10-bit). Instead of re-encoding the whole file before playback can start
 * (minutes of waiting), we expose a VOD playlist computed from the file's
 * duration and encode each ~6s segment lazily when the player requests it.
 *
 * This gives near-instant start AND seeking for any codec: seeking just makes
 * the player jump to a segment, which we encode on the spot. Segments are
 * cached on disk so re-watching or re-seeking is free.
 *
 * H.264 8-bit still uses /engine/transmux (a single seekable MP4 cache); the
 * client picks the path from the `transcode` flag returned by /engine/probe.
 *
 *   GET /engine/hls/:infoHash/:fileIndex/playlist.m3u8   → VOD media playlist
 *   GET /engine/hls/:infoHash/:fileIndex/seg/:seg        → one MPEG-TS segment
 */

const SEG_DURATION = 6

interface AudioSel {
  map: string
  key: string
}

function audioFrom(q: string | undefined): AudioSel {
  const idx = q !== undefined && /^\d+$/.test(q) ? Number(q) : null
  return {
    map: idx !== null ? `0:${idx}` : '0:a:0',
    key: idx !== null ? `a${idx}` : 'adef',
  }
}

type Resolved =
  | { ok: true; torrent: WTTorrent; file: WTFile; path: string }
  | { ok: false; status: number; message: string }

/** Require the *complete* source file on disk (segment encoding seeks into it). */
function resolveComplete(infoHash: string, fileIndexStr: string): Resolved {
  const torrent = engine.get(infoHash)
  if (!torrent) return { ok: false, status: 404, message: 'torrent not found' }
  const idx = Number(fileIndexStr)
  const file = torrent.files[idx]
  if (!file) return { ok: false, status: 404, message: 'file not found' }
  file.select(2)
  const p = join(torrent.path, file.path)
  if (!existsSync(p) || statSync(p).size < file.length) {
    return { ok: false, status: 503, message: 'file is still downloading' }
  }
  return { ok: true, torrent, file, path: p }
}

// Per-segment in-flight encodes, so concurrent requests for the same segment
// (e.g. the player double-fetching) share one ffmpeg run.
const segJobs = new Map<string, Promise<void>>()

function encodeSegment(
  srcPath: string,
  outPath: string,
  start: number,
  dur: number,
  vArgs: string[],
  audioMap: string,
): Promise<void> {
  const partPath = `${outPath}.part`
  return new Promise<void>((resolve, reject) => {
    // -ss before -i: fast input seek, resets timestamps to ~0 at the cut.
    // -output_ts_offset <start>: restore absolute timestamps so segments
    // stitch into one continuous timeline for the player.
    // -force_key_frames expr:gte(t,0): keyframe at the first frame so each
    // segment is independently decodable.
    const ff = spawn('ffmpeg', [
      '-nostdin', '-loglevel', 'error',
      '-ss', String(start),
      '-i', srcPath,
      '-t', String(dur),
      '-map', '0:v:0',
      '-map', audioMap,
      ...vArgs,
      '-force_key_frames', 'expr:gte(t,0)',
      '-c:a', 'aac', '-b:a', '192k', '-ac', '2',
      '-muxdelay', '0', '-muxpreload', '0',
      '-output_ts_offset', String(start),
      '-f', 'mpegts',
      '-y', partPath,
    ], { stdio: ['ignore', 'ignore', 'pipe'] })

    let err = ''
    ff.stderr.on('data', (d: Buffer) => { err += d.toString() })
    ff.on('error', reject)
    ff.on('close', (code) => {
      if (code === 0) {
        try {
          renameSync(partPath, outPath)
          enforceCacheLimit()
          resolve()
        } catch (e) {
          reject(e)
        }
      } else {
        unlink(partPath, () => {})
        reject(new Error(`ffmpeg segment exit ${code}: ${err.trim()}`))
      }
    })
  })
}

export async function registerHlsRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { infoHash: string; fileIndex: string }; Querystring: { audio?: string } }>(
    '/engine/hls/:infoHash/:fileIndex/playlist.m3u8',
    async (req, reply) => {
      const r = resolveComplete(req.params.infoHash, req.params.fileIndex)
      if (!r.ok) {
        reply.status(r.status).header('Retry-After', '5').send({ error: r.message })
        return
      }
      const probe = await probeVideo(r.path)
      if (!probe.duration || probe.duration <= 0) {
        reply.status(500).send({ error: 'could not determine video duration' })
        return
      }

      const count = Math.ceil(probe.duration / SEG_DURATION)
      let body = '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-PLAYLIST-TYPE:VOD\n'
      body += `#EXT-X-TARGETDURATION:${SEG_DURATION}\n#EXT-X-MEDIA-SEQUENCE:0\n`
      for (let i = 0; i < count; i++) {
        const segDur = Math.min(SEG_DURATION, probe.duration - i * SEG_DURATION)
        body += `#EXTINF:${segDur.toFixed(3)},\nseg/${i}\n`
      }
      body += '#EXT-X-ENDLIST\n'

      reply
        .header('Content-Type', 'application/vnd.apple.mpegurl')
        .header('Cache-Control', 'no-cache')
        .send(body)
    },
  )

  app.get<{ Params: { infoHash: string; fileIndex: string; seg: string }; Querystring: { audio?: string } }>(
    '/engine/hls/:infoHash/:fileIndex/seg/:seg',
    async (
      req: FastifyRequest<{ Params: { infoHash: string; fileIndex: string; seg: string }; Querystring: { audio?: string } }>,
      reply: FastifyReply,
    ) => {
      const r = resolveComplete(req.params.infoHash, req.params.fileIndex)
      if (!r.ok) {
        reply.status(r.status).header('Retry-After', '5').send({ error: r.message })
        return
      }
      const n = Number(req.params.seg)
      if (!Number.isInteger(n) || n < 0) {
        reply.status(400).send({ error: 'invalid segment' })
        return
      }

      const audio = audioFrom(req.query.audio)
      const probe = await probeVideo(r.path)
      const dur = probe.duration ?? 0
      const start = n * SEG_DURATION
      if (dur > 0 && start >= dur) {
        reply.status(404).send({ error: 'segment out of range' })
        return
      }
      const segDur = dur > 0 ? Math.min(SEG_DURATION, dur - start) : SEG_DURATION

      const dir = hlsSegmentDir(req.params.infoHash, Number(req.params.fileIndex), audio.key)
      const outPath = join(dir, `seg-${n}.ts`)

      if (!existsSync(outPath)) {
        let job = segJobs.get(outPath)
        if (!job) {
          mkdirSync(dir, { recursive: true })
          job = encodeSegment(r.path, outPath, start, segDur, videoArgs(probe), audio.map)
            .finally(() => segJobs.delete(outPath))
          segJobs.set(outPath, job)
        }
        try {
          await job
        } catch (e) {
          logger.error({ err: String(e), infoHash: req.params.infoHash, seg: n }, 'hls segment encode failed')
          reply.status(500).send({ error: 'segment encode failed' })
          return
        }
      }

      const total = statSync(outPath).size
      reply.hijack()
      reply.raw.writeHead(200, {
        'Content-Type': 'video/mp2t',
        'Content-Length': total,
        'Cache-Control': 'public, max-age=3600',
      })
      createReadStream(outPath).pipe(reply.raw)
    },
  )
}
