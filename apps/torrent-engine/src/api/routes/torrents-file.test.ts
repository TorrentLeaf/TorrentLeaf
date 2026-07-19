import { describe, it, expect, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildServer } from '../server.js'
import { torrentManager } from '../../torrent/manager.js'

let addedHash = ''

afterAll(async () => {
  if (addedHash) await torrentManager.remove(addedHash)
})

describe('POST /engine/torrents/file', () => {
  it('accepts a .torrent upload and returns a status with infoHash', async () => {
    const app = await buildServer()
    const torrent = readFileSync(new URL('../../../test/fixtures/sample.torrent', import.meta.url))
    const boundary = '----tl'
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="torrent"; filename="s.torrent"\r\n` +
          `Content-Type: application/x-bittorrent\r\n\r\n`,
      ),
      torrent,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ])

    const res = await app.inject({
      method: 'POST',
      url: '/engine/torrents/file',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    })

    expect(res.statusCode).toBe(201)
    const json = res.json()
    expect(json.infoHash).toMatch(/^[a-f0-9]{40}$/)
    addedHash = json.infoHash
    await app.close()
  })
})
