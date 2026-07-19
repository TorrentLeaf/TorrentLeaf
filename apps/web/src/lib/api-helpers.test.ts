import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import MockAdapter from 'axios-mock-adapter'
import { api } from './api'
import { listTorrents, deleteTorrent, addTorrent, addTorrentFile } from './torrents'
import { fetchLibrary, addToLibrary, removeFromLibrary, setFavorite } from './library'
import { fetchAdminTorrents, pauseTorrent, resumeTorrent, deleteTorrent as adminDelete } from './admin'
import { fetchSettings, updateSettings } from './settings'

let mock: MockAdapter
beforeEach(() => {
  mock = new MockAdapter(api)
})
afterEach(() => mock.restore())

describe('torrents API', () => {
  it('listTorrents', async () => {
    mock.onGet('/torrents').reply(200, [{ id: 't1' }])
    expect(await listTorrents()).toEqual([{ id: 't1' }])
  })
  it('deleteTorrent', async () => {
    mock.onDelete('/torrents/t1').reply(204)
    await expect(deleteTorrent('t1')).resolves.toBeUndefined()
  })
  it('addTorrent posts the magnet', async () => {
    mock.onPost('/torrents').reply((cfg) => {
      expect(JSON.parse(cfg.data)).toEqual({ magnetURI: 'magnet:?x' })
      return [201, { id: 't9', name: 'OP' }]
    })
    expect((await addTorrent('magnet:?x')).id).toBe('t9')
  })
  it('addTorrentFile posts multipart FormData', async () => {
    mock.onPost('/torrents/file').reply((cfg) => {
      expect(cfg.data).toBeInstanceOf(FormData)
      return [201, { id: 'f1', name: 'x' }]
    })
    const file = new File([new Uint8Array([0x64])], 'x.torrent')
    expect((await addTorrentFile(file)).id).toBe('f1')
  })
})

describe('library API', () => {
  it('fetchLibrary builds query params', async () => {
    mock.onGet('/library?type=manga&favorites=true').reply(200, [{ id: 'l1' }])
    expect(await fetchLibrary('manga', true)).toEqual([{ id: 'l1' }])
  })
  it('fetchLibrary omits type=all', async () => {
    mock.onGet('/library?').reply(200, [])
    expect(await fetchLibrary('all')).toEqual([])
  })
  it('addToLibrary', async () => {
    mock.onPost('/library').reply(201, { id: 'l2' })
    expect((await addToLibrary('sess', 'manga', 'OP')).id).toBe('l2')
  })
  it('removeFromLibrary', async () => {
    mock.onDelete('/library/l1').reply(204)
    await expect(removeFromLibrary('l1')).resolves.toBeUndefined()
  })
  it('setFavorite toggles via POST/DELETE', async () => {
    mock.onPost('/library/l1/favorite').reply(204)
    mock.onDelete('/library/l1/favorite').reply(204)
    await expect(setFavorite('l1', true)).resolves.toBeUndefined()
    await expect(setFavorite('l1', false)).resolves.toBeUndefined()
  })
})

describe('admin API', () => {
  it('fetchAdminTorrents', async () => {
    mock.onGet('/admin/torrents').reply(200, [{ id: 'a1' }])
    expect(await fetchAdminTorrents()).toEqual([{ id: 'a1' }])
  })
  it('pause / resume / delete', async () => {
    mock.onPost('/admin/torrents/a1/pause').reply(204)
    mock.onPost('/admin/torrents/a1/resume').reply(204)
    mock.onDelete('/admin/torrents/a1').reply(204)
    await expect(pauseTorrent('a1')).resolves.toBeUndefined()
    await expect(resumeTorrent('a1')).resolves.toBeUndefined()
    await expect(adminDelete('a1')).resolves.toBeUndefined()
  })
})

describe('settings API', () => {
  it('fetchSettings', async () => {
    mock.onGet('/settings').reply(200, { downloadPath: 'manga' })
    expect((await fetchSettings()).downloadPath).toBe('manga')
  })
  it('updateSettings sends the partial', async () => {
    mock.onPut('/settings').reply((cfg) => {
      expect(JSON.parse(cfg.data)).toEqual({ downloadPath: 'books' })
      return [200, { downloadPath: 'books' }]
    })
    expect((await updateSettings({ downloadPath: 'books' })).downloadPath).toBe('books')
  })
})
