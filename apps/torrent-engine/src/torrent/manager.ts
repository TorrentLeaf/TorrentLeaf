import axios from 'axios'
import Redis from 'ioredis'
import parseTorrent from 'parse-torrent'
import { mkdirSync } from 'node:fs'
import { config } from '../config.js'
import { logger } from '../logger.js'
import { analyzeFiles, isBlocked, isSafePath } from '../files/detector.js'
import { AddTorrentError } from './errors.js'
import { assertDiskAvailable } from './disk.js'
import { resolveDownloadPath } from './downloadPath.js'
import { engine, type WTTorrent } from './engine.js'
import type { TorrentStatus } from './types.js'

const MAGNET_RE = /^magnet:\?xt=urn:btih:[a-fA-F0-9]{40}(&.*)?$/
const MAGNET_MAX_LEN = 2048

const diskUsedBytes = (): number =>
  engine.list().reduce((sum, t) => sum + (t.downloaded ?? 0), 0)

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
  add(magnetURI: string, downloadPath?: string, opts: { reseed?: boolean } = {}): TorrentStatus {
    if (magnetURI.length > MAGNET_MAX_LEN) {
      throw new AddTorrentError('invalid_magnet', 'magnet uri too long')
    }
    if (!MAGNET_RE.test(magnetURI)) {
      throw new AddTorrentError('invalid_magnet', 'invalid magnet uri')
    }

    if (engine.list().length >= config.maxTorrents) {
      throw new AddTorrentError('max_torrents', `max torrents reached (${config.maxTorrents})`)
    }

    const resolvedPath = resolveDownloadPath(config.downloadPath, downloadPath)
    // mkdir -p so statfs + webtorrent write to an existing dir
    mkdirSync(resolvedPath, { recursive: true })
    assertDiskAvailable(resolvedPath, opts, { usedBytes: diskUsedBytes })

    const torrent = engine.add(magnetURI, resolvedPath)

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
   * Add a torrent from a raw .torrent file buffer. Same disk guard + safe
   * download-path resolution as `add`. Returns immediately; the metadata
   * webhook fires later if the torrent isn't ready yet.
   */
  async addFromFile(torrentFile: Buffer, downloadPath?: string): Promise<TorrentStatus> {
    if (engine.list().length >= config.maxTorrents) {
      throw new AddTorrentError('max_torrents', `max torrents reached (${config.maxTorrents})`)
    }
    // Parse the file up front so we always know the infoHash for the immediate
    // response — webtorrent doesn't expose it synchronously after add(Buffer).
    let parsed: { infoHash?: string; name?: string }
    try {
      parsed = (await parseTorrent(torrentFile)) as { infoHash?: string; name?: string }
    } catch {
      throw new AddTorrentError('invalid_upload', 'not a valid .torrent file')
    }

    const resolvedPath = resolveDownloadPath(config.downloadPath, downloadPath)
    mkdirSync(resolvedPath, { recursive: true })
    assertDiskAvailable(resolvedPath, {}, { usedBytes: diskUsedBytes })

    const torrent = engine.add(torrentFile, resolvedPath)
    if (torrent.ready && torrent.infoHash) return this.toStatus(torrent)
    return {
      infoHash: (torrent.infoHash || parsed.infoHash || '').toLowerCase(),
      name: torrent.name || parsed.name || '',
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

  async remove(infoHash: string, opts: { destroyStore?: boolean } = {}): Promise<void> {
    await engine.remove(infoHash, opts)
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
