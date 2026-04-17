// @ts-expect-error — webtorrent não publica types oficiais
import WebTorrent from 'webtorrent'
import { config } from '../config.js'
import { logger } from '../logger.js'

export type WTTorrent = {
  infoHash: string
  name: string
  length: number
  ready: boolean
  progress: number
  downloadSpeed: number
  uploadSpeed: number
  numPeers: number
  downloaded: number
  files: WTFile[]
  on(event: string, cb: (...args: unknown[]) => void): void
  destroy(cb?: (err?: Error) => void): void
}

export type WTFile = {
  name: string
  path: string
  length: number
  select(priority?: number): void
  deselect(): void
  createReadStream(opts?: { start?: number; end?: number }): NodeJS.ReadableStream
}

type WTClient = {
  add(uri: string, opts: Record<string, unknown>, cb?: (t: WTTorrent) => void): WTTorrent | null
  get(infoHash: string): WTTorrent | undefined
  remove(infoHash: string, cb?: (err?: Error) => void): void
  on(event: string, cb: (...args: unknown[]) => void): void
  torrents: WTTorrent[]
}

class TorrentEngine {
  private static _instance: TorrentEngine | null = null
  private readonly client: WTClient

  private constructor() {
    this.client = new WebTorrent({
      maxConns: config.maxConnsPerTorrent,
      uploadLimit: -1,
      downloadLimit: -1,
      // Disable WebRTC — server-side engine only needs TCP/uTP peers
      webSeeds: false,
    }) as unknown as WTClient

    this.client.on('error', (err) => {
      logger.error({ err }, 'webtorrent client error')
    })

    logger.info('webtorrent engine initialized')
  }

  static getInstance(): TorrentEngine {
    if (!TorrentEngine._instance) {
      TorrentEngine._instance = new TorrentEngine()
    }
    return TorrentEngine._instance
  }

  add(magnetURI: string): Promise<WTTorrent> {
    return new Promise((resolve, reject) => {
      const existing = this.tryGet(magnetURI)
      if (existing) {
        if (existing.ready) return resolve(existing)
        existing.on('ready', () => resolve(existing))
        existing.on('error', (err) => reject(err instanceof Error ? err : new Error(String(err))))
        return
      }

      try {
        const torrent = this.client.add(magnetURI, {
          path: config.downloadPath,
          maxConns: config.maxConnsPerTorrent,
        })

        if (!torrent) {
          return reject(new Error('webtorrent client.add() returned null — native dependencies may be missing'))
        }

        logger.debug({ infoHash: torrent.infoHash ?? 'unknown' }, 'torrent added, waiting for ready')

        torrent.on('ready', () => resolve(torrent))
        torrent.on('error', (err) => reject(err instanceof Error ? err : new Error(String(err))))
      } catch (err) {
        logger.error({ err }, 'client.add() threw')
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    })
  }

  get(infoHash: string): WTTorrent | undefined {
    return this.client.get(infoHash)
  }

  remove(infoHash: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client.remove(infoHash, (err) => (err ? reject(err) : resolve()))
    })
  }

  list(): WTTorrent[] {
    return this.client.torrents
  }

  private tryGet(magnetURI: string): WTTorrent | undefined {
    const m = magnetURI.match(/urn:btih:([a-fA-F0-9]{40})/)
    if (!m) return undefined
    return this.client.get(m[1].toLowerCase())
  }
}

export const engine = TorrentEngine.getInstance()
