import { statfsSync } from 'node:fs'
import { config } from '../config.js'
import { AddTorrentError } from './errors.js'

export type DiskCheckDeps = {
  statfs?: (dir: string) => { bavail: number; bsize: number }
  usedBytes?: () => number
}

/**
 * Refuse new torrents when the disk is constrained. Two independent gates:
 *  - free-space floor: the filesystem must have at least minFreeDiskGB free.
 *    SKIPPED for reseed — re-adding a torrent whose data already exists on
 *    disk downloads no new bytes, so the floor (which gates NEW downloads)
 *    must not block recovery.
 *  - usage budget: bytes already downloaded across active torrents must be
 *    under maxDiskGB. Always enforced.
 */
export function assertDiskAvailable(
  dir: string,
  opts: { reseed?: boolean } = {},
  deps: DiskCheckDeps = {},
): void {
  const GB = 1024 ** 3
  const statfs = deps.statfs ?? ((d: string) => statfsSync(d))

  if (!opts.reseed) {
    try {
      const st = statfs(dir)
      const freeBytes = st.bavail * st.bsize
      if (freeBytes < config.minFreeDiskGB * GB) {
        throw new AddTorrentError(
          'insufficient_disk',
          `not enough free disk space (${(freeBytes / GB).toFixed(1)} GB free, ` +
            `minimum ${config.minFreeDiskGB} GB)`,
        )
      }
    } catch (err) {
      // Re-throw our own guard; swallow statfs failures (e.g. path not yet
      // created) so a measurement error never blocks adds on its own.
      if (err instanceof AddTorrentError && err.code === 'insufficient_disk') throw err
    }
  }

  const usedBytes = (deps.usedBytes ?? (() => 0))()
  if (usedBytes >= config.maxDiskGB * GB) {
    throw new AddTorrentError(
      'disk_budget',
      `disk budget reached (${(usedBytes / GB).toFixed(1)} GB used, ` +
        `limit ${config.maxDiskGB} GB)`,
    )
  }
}
