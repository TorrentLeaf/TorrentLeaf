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
  async add(magnetURI: string): Promise<TorrentStatus> {
    if (!MAGNET_RE.test(magnetURI)) {
      throw new Error('invalid magnet uri')
    }

    if (engine.list().length >= config.maxTorrents) {
      throw new Error(`max torrents reached (${config.maxTorrents})`)
    }

    const torrent = await engine.add(magnetURI)
    logger.info({ infoHash: torrent.infoHash, name: torrent.name }, 'torrent ready')

    this.wireEvents(torrent)
    await this.notifyMetadataReady(torrent)

    return this.toStatus(torrent)
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
    return engine.list().map((t) => this.toStatus(t))
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

  private wireEvents(torrent: WTTorrent): void {
    torrent.on('error', (err) => {
      logger.error({ err, infoHash: torrent.infoHash }, 'torrent error')
    })
    torrent.on('done', () => {
      logger.info({ infoHash: torrent.infoHash }, 'torrent download complete — seeding')
    })
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
