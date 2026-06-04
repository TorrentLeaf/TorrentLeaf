import axios from 'axios'
import Redis from 'ioredis'
import { statfsSync } from 'node:fs'
import { config } from '../config.js'
import { logger } from '../logger.js'
import { analyzeFiles, isBlocked, isSafePath } from '../files/detector.js'
import { engine, type WTTorrent } from './engine.js'
import type { TorrentStatus } from './types.js'

const MAGNET_RE = /^magnet:\?xt=urn:btih:[a-fA-F0-9]{40}(&.*)?$/
const MAGNET_MAX_LEN = 2048

const redis = new Redis(config.redisUrl, { lazyConnect: true, maxRetriesPerRequest: null })
let progressTimer: NodeJS.Timeout | null = null

export class TorrentManager {
  constructor() {
    // Listen for metadata on ALL torrents at the client level.
    // When any torrent becomes ready, verify paths are safe and send the metadata webhook.
    engine.onTorrentReady((torrent) => {
      logger.info({ infoHash: torrent.infoHash, name: torrent.name }, 'torrent metadata ready')

      const unsafe = torrent.files.find((f) => !isSafePath(f.path) || isBlocked(f.name))
      if (unsafe) {
        logger.warn(
          { infoHash: torrent.infoHash, file: unsafe.path },
          'removing torrent: unsafe or blocked file path',
        )
        engine.remove(torrent.infoHash).catch((err) => {
          logger.warn({ err, infoHash: torrent.infoHash }, 'failed to remove unsafe torrent')
        })
        return
      }

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
  add(magnetURI: string, downloadPath?: string): TorrentStatus {
    if (magnetURI.length > MAGNET_MAX_LEN) {
      throw new Error('magnet uri too long')
    }
    if (!MAGNET_RE.test(magnetURI)) {
      throw new Error('invalid magnet uri')
    }

    if (engine.list().length >= config.maxTorrents) {
      throw new Error(`max torrents reached (${config.maxTorrents})`)
    }

    this.assertDiskAvailable()

    const torrent = engine.add(magnetURI, downloadPath)

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

  /**
   * Refuse new torrents when the disk is constrained. Two independent gates:
   *  - free-space floor: the filesystem must have at least minFreeDiskGB free,
   *    which prevents ENOSPC regardless of the budget;
   *  - usage budget: the bytes already downloaded across active torrents must
   *    be under maxDiskGB.
   * Uses the engine's in-memory byte accounting + statfs, so there's no disk
   * walk. Throws (→ 400 at the route) with a clear message.
   */
  private assertDiskAvailable(): void {
    const GB = 1024 ** 3

    try {
      const st = statfsSync(config.downloadPath)
      const freeBytes = st.bavail * st.bsize
      if (freeBytes < config.minFreeDiskGB * GB) {
        throw new Error(
          `not enough free disk space (${(freeBytes / GB).toFixed(1)} GB free, ` +
            `minimum ${config.minFreeDiskGB} GB)`,
        )
      }
    } catch (err) {
      // Re-throw our own guard; swallow statfs failures (e.g. path not yet
      // created) so a measurement error never blocks adds on its own.
      if (err instanceof Error && err.message.startsWith('not enough free disk')) throw err
    }

    const usedBytes = engine.list().reduce((sum, t) => sum + (t.downloaded ?? 0), 0)
    if (usedBytes >= config.maxDiskGB * GB) {
      throw new Error(
        `disk budget reached (${(usedBytes / GB).toFixed(1)} GB used, ` +
          `limit ${config.maxDiskGB} GB)`,
      )
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
    if (!isSafePath(file.path) || isBlocked(file.name)) {
      throw new Error('unsafe or blocked file')
    }

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
