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
  // Absolute directory where this torrent's files are stored on disk.
  // Set by webtorrent from the `path` option passed to client.add().
  path: string
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
  add(source: string | Buffer, opts: Record<string, unknown>): WTTorrent | null
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
      torrentPort: config.torrentPort,
      dhtPort: config.dhtPort,
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
   * @param downloadPath — optional per-torrent download directory; falls back
   *                       to the global config.downloadPath.
   */
  add(source: string | Buffer, downloadPath?: string): WTTorrent {
    // Dedup-by-hash is only possible when the source is a magnet string; for a
    // .torrent Buffer, webtorrent dedups internally and returns the existing
    // torrent if the infoHash already exists.
    if (typeof source === 'string') {
      const existing = this.findByMagnet(source)
      if (existing) return existing
    }

    const effectivePath = downloadPath ?? config.downloadPath

    let torrent: WTTorrent | null = null
    try {
      torrent = this.client.add(source, {
        path: effectivePath,
        maxConns: config.maxConnsPerTorrent,
      })
    } catch (err) {
      if (typeof source === 'string') {
        const found = this.findByMagnet(source)
        if (found) return found
      }
      throw err
    }

    if (!torrent) {
      throw new Error('webtorrent client.add() returned null')
    }

    logger.info(
      { ready: torrent.ready, infoHash: torrent.infoHash ?? '(pending)', path: effectivePath },
      'torrent added to client',
    )
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
    // webtorrent 2.x made client.get() async; we only need synchronous lookup by infoHash.
    return this.client.torrents.find((t) => t.infoHash === infoHash)
  }

  remove(infoHash: string): Promise<void> {
    // Idempotent: removing a torrent the client doesn't have is a no-op.
    // webtorrent's client.remove() throws "No torrent with id <hash>" for
    // unknown hashes — and in 2.x that throw can surface asynchronously,
    // escaping the try/catch below and crashing the whole process. Guarding
    // on existence first avoids that entirely (deleting an already-gone
    // torrent is a common case after the DB and engine drift apart).
    if (!this.get(infoHash)) {
      return Promise.resolve()
    }
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
    return this.client.torrents.find((t) => t.infoHash === hash)
  }
}

export const engine = TorrentEngine.getInstance()
