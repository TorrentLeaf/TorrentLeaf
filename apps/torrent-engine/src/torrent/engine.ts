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
  add(uri: string, opts: Record<string, unknown>): WTTorrent | null
  get(id: string): WTTorrent | undefined
  remove(id: string, cb?: (err?: Error) => void): void
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

  /**
   * Add a torrent. Returns immediately — does NOT wait for metadata.
   * The caller should listen for the 'ready' event separately if needed.
   */
  add(magnetURI: string): WTTorrent {
    // Check if already in the client
    const existing = this.findByMagnet(magnetURI)
    if (existing) return existing

    let torrent: WTTorrent | null = null
    try {
      torrent = this.client.add(magnetURI, {
        path: config.downloadPath,
        maxConns: config.maxConnsPerTorrent,
      })
    } catch (err) {
      // "Cannot add duplicate torrent" — find it in the list
      const found = this.findByMagnet(magnetURI)
      if (found) return found
      throw err
    }

    if (!torrent) {
      throw new Error('webtorrent client.add() returned null')
    }

    logger.info({ ready: torrent.ready, infoHash: torrent.infoHash ?? '(pending)' }, 'torrent added to client')
    return torrent
  }

  /**
   * Register a callback for when ANY torrent becomes ready (metadata fetched).
   * Uses the client-level 'torrent' event which fires for each ready torrent.
   */
  onTorrentReady(cb: (torrent: WTTorrent) => void): void {
    this.client.on('torrent', cb as (...args: unknown[]) => void)
  }

  get(infoHash: string): WTTorrent | undefined {
    return this.client.get(infoHash) ?? this.client.torrents.find((t) => t.infoHash === infoHash)
  }

  remove(infoHash: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.client.remove(infoHash, (err) => (err ? reject(err) : resolve()))
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    })
  }

  list(): WTTorrent[] {
    return this.client.torrents
  }

  private findByMagnet(magnetURI: string): WTTorrent | undefined {
    const m = magnetURI.match(/urn:btih:([a-fA-F0-9]{40})/)
    if (!m) return undefined
    const hash = m[1].toLowerCase()
    return this.client.get(hash)
      ?? this.client.torrents.find((t) => t.infoHash === hash)
  }
}

export const engine = TorrentEngine.getInstance()
