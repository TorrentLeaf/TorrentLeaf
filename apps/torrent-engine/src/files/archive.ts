import path from 'node:path'
import type { Readable } from 'node:stream'
import yauzl, { type Entry, type ZipFile } from 'yauzl'
import type { WTFile } from '../torrent/engine.js'
import { classifyFile, detectMime } from './detector.js'

export interface ArchiveEntry {
  index: number
  name: string
  size: number
  mimeType: string
}

// yauzl's random-access API lets us read the ZIP central directory (stored
// at the tail of the file) and individual entries without ever pulling the
// whole archive through memory or disk — WebTorrent fetches exactly the
// byte ranges we request.
class WTFileReader extends yauzl.RandomAccessReader {
  constructor(private readonly file: WTFile) {
    super()
  }
  _readStreamForRange(start: number, end: number): Readable {
    // yauzl passes `end` exclusive; WTFile.createReadStream expects inclusive.
    return this.file.createReadStream({ start, end: end - 1 }) as Readable
  }
}

function openZip(file: WTFile): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    const reader = new WTFileReader(file)
    yauzl.fromRandomAccessReader(
      reader,
      file.length,
      { lazyEntries: true, autoClose: false },
      (err, zip) => {
        if (err || !zip) return reject(err ?? new Error('failed to open zip'))
        resolve(zip)
      },
    )
  })
}

function collectImageEntries(zip: ZipFile): Promise<Entry[]> {
  return new Promise((resolve, reject) => {
    const entries: Entry[] = []
    zip.on('entry', (entry: Entry) => {
      // Skip directory entries and anything that isn't an image we can render.
      if (!/\/$/.test(entry.fileName) && classifyFile(entry.fileName) === 'image') {
        entries.push(entry)
      }
      zip.readEntry()
    })
    zip.on('end', () => {
      entries.sort((a, b) =>
        a.fileName.localeCompare(b.fileName, undefined, { numeric: true, sensitivity: 'base' }),
      )
      resolve(entries)
    })
    zip.on('error', reject)
    zip.readEntry()
  })
}

export async function listCbzEntries(file: WTFile): Promise<ArchiveEntry[]> {
  const zip = await openZip(file)
  try {
    const entries = await collectImageEntries(zip)
    return entries.map((e, i) => ({
      index: i,
      name: path.posix.basename(e.fileName),
      size: Number(e.uncompressedSize),
      mimeType: detectMime(e.fileName),
    }))
  } finally {
    zip.close()
  }
}

export interface OpenedEntry {
  stream: Readable
  mime: string
  length: number
  name: string
}

export async function openCbzEntry(file: WTFile, entryIndex: number): Promise<OpenedEntry> {
  const zip = await openZip(file)
  const entries = await collectImageEntries(zip).catch((err) => {
    zip.close()
    throw err
  })
  const target = entries[entryIndex]
  if (!target) {
    zip.close()
    throw new Error(`entry ${entryIndex} out of range (${entries.length} total)`)
  }
  return new Promise<OpenedEntry>((resolve, reject) => {
    zip.openReadStream(target, (err, stream) => {
      if (err || !stream) {
        zip.close()
        return reject(err ?? new Error('failed to open entry stream'))
      }
      // Close the zip handle once the entry stream is fully consumed or torn
      // down — the underlying WTFile reader holds no OS resources, but the
      // yauzl bookkeeping should still be released.
      const cleanup = (): void => zip.close()
      stream.once('end', cleanup)
      stream.once('close', cleanup)
      stream.once('error', cleanup)
      resolve({
        stream,
        mime: detectMime(target.fileName),
        length: Number(target.uncompressedSize),
        name: path.posix.basename(target.fileName),
      })
    })
  })
}
