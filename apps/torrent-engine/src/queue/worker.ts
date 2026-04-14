import Bull, { type Job, type Queue } from 'bull'
import { config } from '../config.js'
import { logger } from '../logger.js'
import { torrentManager } from '../torrent/manager.js'

export interface AddTorrentJob {
  magnetURI: string
  userId: string
}

export interface CleanupJob {
  olderThanDays: number
}

const connectionOpts = { redis: config.redisUrl }

export const addTorrentQueue: Queue<AddTorrentJob> = new Bull<AddTorrentJob>(
  'add-torrent',
  connectionOpts,
)
export const cleanupQueue: Queue<CleanupJob> = new Bull<CleanupJob>('cleanup', connectionOpts)

export function registerWorkers(): void {
  addTorrentQueue.process(async (job: Job<AddTorrentJob>) => {
    logger.info({ jobId: job.id, userId: job.data.userId }, 'processing add-torrent job')
    const status = await torrentManager.add(job.data.magnetURI)
    return { infoHash: status.infoHash, name: status.name }
  })

  cleanupQueue.process(async (job: Job<CleanupJob>) => {
    logger.info({ jobId: job.id, olderThanDays: job.data.olderThanDays }, 'processing cleanup job')
    return { cleaned: 0 }
  })

  for (const q of [addTorrentQueue, cleanupQueue]) {
    q.on('failed', (job, err) => {
      logger.error({ err, jobId: job.id, queue: q.name }, 'job failed')
    })
    q.on('completed', (job) => {
      logger.debug({ jobId: job.id, queue: q.name }, 'job completed')
    })
  }

  logger.info('bull workers registered')
}

export async function closeQueues(): Promise<void> {
  await Promise.all([addTorrentQueue.close(), cleanupQueue.close()])
}
