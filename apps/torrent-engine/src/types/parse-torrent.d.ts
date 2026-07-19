// Minimal ambient types for parse-torrent v11 (ships no declarations).
// We only use the default export to derive infoHash/name from a .torrent buffer.
declare module 'parse-torrent' {
  interface ParsedTorrent {
    infoHash?: string
    name?: string
    [key: string]: unknown
  }
  export default function parseTorrent(
    input: Buffer | Uint8Array | string,
  ): ParsedTorrent | Promise<ParsedTorrent>
}
