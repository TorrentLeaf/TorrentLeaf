import { spawn } from 'node:child_process'

/**
 * Shared video probing + codec-decision helpers used by the transmux (full
 * MP4 cache) and HLS (on-demand segments) routes, so the "what plays in a
 * browser" rule lives in exactly one place.
 *
 * Rule: only 8-bit H.264 in a browser-safe pixel format can be repackaged
 * with `-c:v copy`. HEVC/H.265, VP9, AV1 and 10-bit H.264 (Hi10P) must be
 * re-encoded to baseline H.264.
 */

export interface VideoProbe {
  codec: string | null
  pixFmt: string | null
  duration: number | null
}

const BROWSER_SAFE_PIXFMTS = new Set(['yuv420p', 'yuvj420p'])

export function probeVideo(filePath: string): Promise<VideoProbe> {
  return new Promise((resolve) => {
    const proc = spawn('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=codec_name,pix_fmt:format=duration',
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
        const dur = j.format?.duration != null ? Number(j.format.duration) : null
        resolve({
          codec: s.codec_name ?? null,
          pixFmt: s.pix_fmt ?? null,
          duration: Number.isFinite(dur) ? dur : null,
        })
      } catch {
        resolve({ codec: null, pixFmt: null, duration: null })
      }
    })
    proc.on('error', () => resolve({ codec: null, pixFmt: null, duration: null }))
  })
}

/** True when the video stream must be re-encoded (i.e. cannot be copied). */
export function videoNeedsTranscode(p: Pick<VideoProbe, 'codec' | 'pixFmt'>): boolean {
  return !(p.codec === 'h264' && p.pixFmt !== null && BROWSER_SAFE_PIXFMTS.has(p.pixFmt))
}

/** ffmpeg `-c:v` arguments: copy when safe, libx264 baseline otherwise. */
export function videoArgs(p: Pick<VideoProbe, 'codec' | 'pixFmt'>): string[] {
  if (!videoNeedsTranscode(p)) return ['-c:v', 'copy']
  return ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-pix_fmt', 'yuv420p']
}
