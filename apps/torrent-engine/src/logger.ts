import pino from 'pino'
import { config, isProduction } from './config.js'

export const logger = pino({
  level: config.logLevel,
  transport: isProduction
    ? undefined
    : {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l' },
      },
  base: { service: 'torrent-engine' },
})
