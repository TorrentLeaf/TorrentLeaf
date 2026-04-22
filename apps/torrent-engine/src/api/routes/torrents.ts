import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { torrentManager } from '../../torrent/manager.js'

const AddBody = z.object({
  magnetURI: z
    .string()
    .max(2048)
    .regex(/^magnet:\?xt=urn:btih:[a-fA-F0-9]{40}(&.*)?$/),
})

const PriorityBody = z.object({
  fileIndex: z.number().int().nonnegative(),
  priority: z.union([z.literal(0), z.literal(1), z.literal(2)]),
})

export async function registerTorrentRoutes(app: FastifyInstance): Promise<void> {
  app.post('/engine/torrents', async (req, reply) => {
    const parsed = AddBody.safeParse(req.body)
    if (!parsed.success) {
      reply.status(400).send({ error: 'invalid body', issues: parsed.error.issues })
      return
    }
    try {
      const status = torrentManager.add(parsed.data.magnetURI)
      reply.status(201).send(status)
    } catch (err) {
      reply.status(400).send({ error: (err as Error).message })
    }
  })

  app.get('/engine/torrents', async () => torrentManager.list())

  app.get<{ Params: { infoHash: string } }>('/engine/torrents/:infoHash', async (req, reply) => {
    try {
      reply.send(torrentManager.get(req.params.infoHash))
    } catch {
      reply.status(404).send({ error: 'torrent not found' })
    }
  })

  app.delete<{ Params: { infoHash: string } }>(
    '/engine/torrents/:infoHash',
    async (req, reply) => {
      try {
        await torrentManager.remove(req.params.infoHash)
        reply.status(204).send()
      } catch (err) {
        reply.status(404).send({ error: (err as Error).message })
      }
    },
  )

  app.post<{ Params: { infoHash: string } }>(
    '/engine/torrents/:infoHash/priority',
    async (req, reply) => {
      const parsed = PriorityBody.safeParse(req.body)
      if (!parsed.success) {
        reply.status(400).send({ error: 'invalid body', issues: parsed.error.issues })
        return
      }
      try {
        torrentManager.setPriority(
          req.params.infoHash,
          parsed.data.fileIndex,
          parsed.data.priority,
        )
        reply.status(204).send()
      } catch (err) {
        reply.status(400).send({ error: (err as Error).message })
      }
    },
  )
}
