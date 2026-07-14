export type AddErrorCode =
  | 'insufficient_disk'
  | 'disk_budget'
  | 'max_torrents'
  | 'invalid_magnet'
  | 'invalid_path'

export class AddTorrentError extends Error {
  readonly code: AddErrorCode
  constructor(code: AddErrorCode, message: string) {
    super(message)
    this.name = 'AddTorrentError'
    this.code = code
  }
}
