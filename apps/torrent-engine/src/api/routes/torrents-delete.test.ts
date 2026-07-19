import { describe, it, expect, vi, afterEach } from 'vitest'
import { buildServer } from '../server.js'
import { torrentManager } from '../../torrent/manager.js'

afterEach(() => vi.restoreAllMocks())

describe('DELETE /engine/torrents/:infoHash', () => {
  it('forwards destroyStore=true to the manager', async () => {
    const spy = vi.spyOn(torrentManager, 'remove').mockResolvedValue(undefined)
    const app = await buildServer()
    const res = await app.inject({
      method: 'DELETE',
      url: '/engine/torrents/abc?destroyStore=true',
    })
    expect(res.statusCode).toBe(204)
    expect(spy).toHaveBeenCalledWith('abc', { destroyStore: true })
    await app.close()
  })

  it('defaults to destroyStore=false without the query', async () => {
    const spy = vi.spyOn(torrentManager, 'remove').mockResolvedValue(undefined)
    const app = await buildServer()
    const res = await app.inject({ method: 'DELETE', url: '/engine/torrents/abc' })
    expect(res.statusCode).toBe(204)
    expect(spy).toHaveBeenCalledWith('abc', { destroyStore: false })
    await app.close()
  })
})
