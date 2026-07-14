import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts'],
    // Integration tests instantiate a real WebTorrent client. Use a writable
    // download dir and random ports (0) so they don't clash with a running
    // engine container holding 6881/6882 or fail to mkdir /data/torrents.
    env: {
      TORRENT_DOWNLOAD_PATH: '/tmp/torrentleaf-test-data',
      TORRENT_PORT: '0',
      DHT_PORT: '0',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      exclude: ['dist/**', 'node_modules/**'],
    },
  },
})
