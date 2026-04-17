import axios from 'axios'
import Redis from 'ioredis'
import { config } from '../config.js'
import { logger } from '../logger.js'
import { analyzeFiles } from '../files/detector.js'
import { engine, type WTTorrent } from './engine.js'
import type { TorrentStatus } from './types.js'

const MAGNET_RE = /^magnet:\?xt=urn:btih:[a-fA-F0-9]{40}/

const redis = new Redis(config.redisUrl, { lazyConnect: true, maxRetriesPerRequest: null })
let progressTimer: NodeJS.Timeout | null = null

export class TorrentManager {
  constructor() {
    // Listen for metadata on ALL torrents at the client level.
    // When any torrent becomes ready, send the metadata webhook.
    engine.onTorrentReady((torrent) => {
      logger.info({ infoHash: torrent.infoHash, name: torrent.name }, 'torrent metadata ready')
      this.notifyMetadataReady(torrent).catch((err) => {
        logger.warn({ err, infoHash: torrent.infoHash }, 'metadata webhook failed')
      })
    })
  }

  /**
   * Add a torrent and return immediately.
   * If the torrent is already ready, returns full status with files.
   * Otherwise returns a minimal status — the metadata webhook fires later.
   */
  add(magnetURI: string): TorrentStatus {
    if (!MAGNET_RE.test(magnetURI)) {
      throw new Error('invalid magnet uri')
    }

    if (engine.list().length >= config.maxTorrents) {
      throw new Error(`max torrents reached (${config.maxTorrents})`)
    }

    const torrent = engine.add(magnetURI)

    if (torrent.ready && torrent.infoHash) {
      logger.info({ infoHash: torrent.infoHash, name: torrent.name }, 'torrent already ready')
      return this.toStatus(torrent)
    }

    // Not ready yet — extract infoHash from magnet URI for immediate response
    const m = magnetURI.match(/urn:btih:([a-fA-F0-9]{40})/)
    const infoHash = m ? m[1].toLowerCase() : ''

    logger.info({ infoHash }, 'torrent added, waiting for metadata from swarm')

    return {
      infoHash,
      name: '',
      ready: false,
      progress: 0,
      downloadSpeed: 0,
      uploadSpeed: 0,
      peers: 0,
      length: 0,
      downloaded: 0,
      files: [],
    }
  }

  get(infoHash: string): TorrentStatus {
    const t = engine.get(infoHash)
    if (!t) throw new Error('torrent not found')
    return this.toStatus(t)
  }

  async remove(infoHash: string): Promise<void> {
    await engine.remove(infoHash)
  }

  list(): TorrentStatus[] {
    return engine.list()
      .filter((t) => t?.infoHash)
      .map((t) => this.toStatus(t))
  }

  setPriority(infoHash: string, fileIndex: number, priority: 0 | 1 | 2): void {
    const t = engine.get(infoHash)
    if (!t) throw new Error('torrent not found')
    const file = t.files[fileIndex]
    if (!file) throw new Error('file index out of range')

    if (priority === 0) {
      file.deselect()
    } else {
      t.files.forEach((f, i) => {
        if (i !== fileIndex && priority === 2) f.deselect()
      })
      file.select(priority)
    }
  }

  startProgressBroadcast(): void {
    if (progressTimer) return
    progressTimer = setInterval(() => {
      for (const t of engine.list()) {
        if (!t?.infoHash) continue
        const payload = JSON.stringify({
          infoHash: t.infoHash,
          progress: t.progress,
          downloadSpeed: t.downloadSpeed,
          uploadSpeed: t.uploadSpeed,
          peers: t.numPeers,
        })
        redis.publish(`torrent:progress:${t.infoHash}`, payload).catch((err) => {
          logger.warn({ err }, 'failed to publish progress')
        })
      }
    }, 2000)
  }

  stopProgressBroadcast(): void {
    if (progressTimer) {
      clearInterval(progressTimer)
      progressTimer = null
    }
  }

  private async notifyMetadataReady(torrent: WTTorrent): Promise<void> {
    try {
      const files = analyzeFiles(torrent)
      await axios.post(
        `${config.apiUrl}/internal/torrents/${torrent.infoHash}/metadata`,
        { name: torrent.name, files, totalLength: torrent.length },
        {
          timeout: 10_000,
          headers: config.apiWebhookSecret
            ? { 'X-Webhook-Secret': config.apiWebhookSecret }
            : undefined,
        },
      )
      logger.info({ infoHash: torrent.infoHash }, 'metadata webhook sent')
    } catch (err) {
      logger.warn({ err, infoHash: torrent.infoHash }, 'metadata webhook failed (non-fatal)')
    }
  }

  private toStatus(t: WTTorrent): TorrentStatus {
    return {
      infoHash: t.infoHash,
      name: t.name,
      ready: t.ready,
      progress: t.progress,
      downloadSpeed: t.downloadSpeed,
      uploadSpeed: t.uploadSpeed,
      peers: t.numPeers,
      length: t.length,
      downloaded: t.downloaded,
      files: analyzeFiles(t),
    }
  }
}

export const torrentManager = new TorrentManager()
