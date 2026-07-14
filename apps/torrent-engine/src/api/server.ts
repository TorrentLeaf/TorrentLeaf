import Fastify, { type FastifyInstance } from 'fastify'
import { config, isProduction } from '../config.js'
import { registerTorrentRoutes } from './routes/torrents.js'
import { registerStreamRoutes } from './routes/stream.js'
import { registerArchiveRoutes } from './routes/archive.js'
import { registerTransmuxRoutes } from './routes/transmux.js'
import { registerHlsRoutes } from './routes/hls.js'
import { registerMediaRoutes } from './routes/media.js'

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.logLevel,
      base: { service: 'torrent-engine' },
      transport: isProduction
        ? undefined
        : {
            target: 'pino-pretty',
            options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l' },
          },
    },
    bodyLimit: 1 * 1024 * 1024,
    disableRequestLogging: false,
  })

  // Accept .torrent file uploads (small; capped at 10 MB, one file).
  await app.register(import('@fastify/multipart'), {
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  })

  app.addHook('onSend', async (_req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff')
    reply.header('X-Frame-Options', 'DENY')
    reply.header('Referrer-Policy', 'no-referrer')
    reply.header('Permissions-Policy', 'interest-cohort=()')
    reply.header('Cross-Origin-Resource-Policy', 'same-site')
    if (isProduction) {
      reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
    }
  })

  app.get('/engine/health', async () => ({ status: 'ok' }))

  await registerTorrentRoutes(app)
  await registerStreamRoutes(app)
  await registerArchiveRoutes(app)
  await registerTransmuxRoutes(app)
  await registerHlsRoutes(app)
  await registerMediaRoutes(app)

  app.setErrorHandler((err, _req, reply) => {
    app.log.error({ err }, 'request error')
    const status = err.statusCode ?? 500
    reply.status(status).send({ error: status >= 500 ? 'internal error' : err.message })
  })

  return app
}
