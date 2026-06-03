import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { existsSync, createReadStream as fsCreateReadStream, statSync } from 'fs'
import { join } from 'path'
import { spawn } from 'child_process'
import { engine } from '../../torrent/engine.js'
import { logger } from '../../logger.js'
import { config } from '../../config.js'

/**
 * /engine/transmux/:infoHash/:fileIndex
 *
 * Transmuxes a video file (typically MKV) to fragmented MP4 on-the-fly via
 * ffmpeg. The browser can then play the resulting mp4 stream natively in a
 * <video> element.
 *
 * This does NOT re-encode — it copies the video/audio streams (very fast,
 * ~0% CPU) and simply repackages them into the fMP4 container.
 */
export async function registerTransmuxRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { infoHash: string; fileIndex: string } }>(
    '/engine/transmux/:infoHash/:fileIndex',
    async (req: FastifyRequest<{ Params: { infoHash: string; fileIndex: string } }>, reply: FastifyReply) => {
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
      file.select(2)

      // Check if file is available on disk
      const diskPath = join(config.downloadPath, file.path)
      const onDisk = existsSync(diskPath) && statSync(diskPath).size > 0

      if (!onDisk) {
        reply
          .status(503)
          .header('Retry-After', '5')
          .send({ error: 'video file is still downloading' })
        return
      }

      logger.info({ infoHash, fileIndex: index, name: file.name }, 'starting transmux')

      // Read from disk for reliability (webtorrent stream may be empty after reseed)
      const inputStream = fsCreateReadStream(diskPath)

      const ffmpeg = spawn('ffmpeg', [
        '-i', 'pipe:0',           // Read from stdin
        '-c:v', 'copy',           // Copy video codec (no re-encoding)
        '-c:a', 'aac',            // Transcode audio to AAC for browser compat
        '-movflags', 'frag_keyframe+empty_moov+faststart',
        '-f', 'mp4',              // Output format: fragmented MP4
        'pipe:1',                 // Write to stdout
      ], {
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      // Pipe file stream → ffmpeg stdin
      inputStream.pipe(ffmpeg.stdin)

      // Handle ffmpeg errors gracefully
      ffmpeg.stderr.on('data', (data: Buffer) => {
        const msg = data.toString()
        // ffmpeg logs progress to stderr — only log actual errors
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

      // When the client disconnects, kill ffmpeg
      req.raw.on('close', () => {
        ffmpeg.kill('SIGTERM')
      })

      reply
        .status(200)
        .headers({
          'Content-Type': 'video/mp4',
          'Transfer-Encoding': 'chunked',
          'Cache-Control': 'no-cache',
        })
        .send(ffmpeg.stdout)
    },
  )
}
