import 'dotenv/config'

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 9000),
  logLevel: process.env.LOG_LEVEL ?? 'info',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  apiUrl: process.env.API_URL ?? 'http://localhost:8080',
  apiWebhookSecret: process.env.API_WEBHOOK_SECRET ?? '',
  downloadPath: process.env.TORRENT_DOWNLOAD_PATH ?? '/data/torrents',
  maxTorrents: Number(process.env.MAX_TORRENTS ?? 50),
  maxDiskGB: Number(process.env.MAX_DISK_GB ?? 20),
  maxConnsPerTorrent: Number(process.env.MAX_CONNS_PER_TORRENT ?? 55),
  torrentPort: Number(process.env.TORRENT_PORT ?? 6881),
  dhtPort: Number(process.env.DHT_PORT ?? 6882),
} as const

export const isProduction = config.env === 'production'
