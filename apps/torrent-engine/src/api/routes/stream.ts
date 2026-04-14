import type { FastifyInstance } from 'fastify'
import { streamFile } from '../../streaming/streamer.js'

export async function registerStreamRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { infoHash: string; fileIndex: string } }>(
    '/engine/stream/:infoHash/:fileIndex',
    streamFile,
  )
}
