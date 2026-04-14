import { buildServer } from './api/server.js'
import { config } from './config.js'
import { logger } from './logger.js'
import { torrentManager } from './torrent/manager.js'
import { closeQueues, registerWorkers } from './queue/worker.js'

async function main(): Promise<void> {
  const app = await buildServer()

  registerWorkers()
  torrentManager.startProgressBroadcast()

  await app.listen({ host: '0.0.0.0', port: config.port })
  logger.info({ port: config.port }, 'torrent-engine listening')

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down')
    torrentManager.stopProgressBroadcast()
    try {
      await app.close()
      await closeQueues()
    } catch (err) {
      logger.error({ err }, 'shutdown error')
    } finally {
      process.exit(0)
    }
  }

  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
}

main().catch((err) => {
  logger.fatal({ err }, 'fatal startup error')
  process.exit(1)
})
