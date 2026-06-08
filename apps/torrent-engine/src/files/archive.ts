import path from 'node:path'
import { existsSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { spawn } from 'node:child_process'
import yauzl, { type Entry, type ZipFile } from 'yauzl'
import { createExtractorFromData } from 'node-unrar-js'
import type { WTFile, WTTorrent } from '../torrent/engine.js'
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

// ─── CBR (RAR) support ──────────────────────────────────────────────────────
// Unlike ZIP, RAR uses streaming headers throughout the file with no central
// directory at the tail, so we can't read it incrementally over the swarm.
// We require the file to be fully on disk before attempting to list/extract.

interface RarFileHeader {
  name: string
  unpSize: number
  flags: { directory?: boolean }
}

interface RarExtractor {
  getFileList(): { fileHeaders: Iterable<RarFileHeader> }
  extract(opts: { files: string[] }): { files: Iterable<{ extraction?: Uint8Array }> }
}

function assertCbrOnDisk(torrent: WTTorrent, file: WTFile): string {
  const diskPath = path.join(torrent.path, file.path)
  if (!existsSync(diskPath)) {
    const err = new Error('CBR archive not yet on disk')
    ;(err as Error & { transient?: boolean }).transient = true
    throw err
  }
  const stat = statSync(diskPath)
  if (stat.size < file.length) {
    const err = new Error('CBR archive still downloading')
    ;(err as Error & { transient?: boolean }).transient = true
    throw err
  }
  return diskPath
}

// Creating a node-unrar-js extractor reads the entire RAR into the wasm heap,
// so doing it per page request is O(archiveSize) per page — the main reason CBR
// paging felt slow. Memoize the extractor by disk path (invalidated if the file
// size changes, e.g. it was still downloading). Bounded to a couple of archives
// since each holds its whole file in memory.
const CBR_EXTRACTOR_MAX = 2
const cbrExtractors = new Map<string, { size: number; extractor: RarExtractor }>()

async function getCbrExtractor(diskPath: string, size: number): Promise<RarExtractor> {
  const cached = cbrExtractors.get(diskPath)
  if (cached && cached.size === size) {
    cbrExtractors.delete(diskPath)
    cbrExtractors.set(diskPath, cached) // bump to most-recently-used
    return cached.extractor
  }
  // node-unrar-js 2.0.2's createExtractorFromFile lists headers fine but extracts
  // zero bytes for RAR5 archives — every CBR page 503'd. createExtractorFromData
  // (whole archive as an in-memory buffer) extracts correctly. The extractor is
  // memoized and already holds its whole file in memory, so reading the buffer
  // here matches the existing memory budget rather than adding to it.
  const data = await readFile(diskPath)
  const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
  const extractor = (await createExtractorFromData({ data: buf })) as RarExtractor
  cbrExtractors.set(diskPath, { size, extractor })
  while (cbrExtractors.size > CBR_EXTRACTOR_MAX) {
    const oldest = cbrExtractors.keys().next().value
    if (oldest === undefined) break
    cbrExtractors.delete(oldest)
  }
  return extractor
}

function listImageHeaders(extractor: RarExtractor): RarFileHeader[] {
  const headers: RarFileHeader[] = []
  for (const h of extractor.getFileList().fileHeaders) {
    if (h.flags?.directory) continue
    if (classifyFile(h.name) !== 'image') continue
    headers.push(h)
  }
  headers.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }),
  )
  return headers
}

export async function listCbrEntries(
  torrent: WTTorrent,
  file: WTFile,
): Promise<ArchiveEntry[]> {
  const diskPath = assertCbrOnDisk(torrent, file)
  const extractor = await getCbrExtractor(diskPath, file.length)
  return listImageHeaders(extractor).map((h, i) => ({
    index: i,
    name: path.posix.basename(h.name),
    size: h.unpSize,
    mimeType: detectMime(h.name),
  }))
}

export async function openCbrEntry(
  torrent: WTTorrent,
  file: WTFile,
  entryIndex: number,
): Promise<OpenedEntry> {
  const diskPath = assertCbrOnDisk(torrent, file)
  const extractor = await getCbrExtractor(diskPath, file.length)
  const headers = listImageHeaders(extractor)
  const target = headers[entryIndex]
  if (!target) {
    throw new Error(`entry ${entryIndex} out of range (${headers.length} total)`)
  }
  const extracted = [...extractor.extract({ files: [target.name] }).files]
  if (extracted.length === 0 || !extracted[0].extraction) {
    throw new Error(`failed to extract entry ${target.name}`)
  }
  const buf = Buffer.from(extracted[0].extraction)
  return {
    stream: Readable.from(buf),
    mime: detectMime(target.name),
    length: buf.length,
    name: path.posix.basename(target.name),
  }
}

// ─── 7z support ─────────────────────────────────────────────────────────────
// Shells out to /usr/bin/7z (p7zip-full from the Dockerfile). No pure-Node
// 7z library has good ergonomics, and the binary is already on the path.
// Like RAR, 7z is not seekable from the swarm — file must be on disk.

const SEVENZ_BIN = '/usr/bin/7z'

function reuseAssertOnDisk(torrent: WTTorrent, file: WTFile): string {
  // The on-disk requirement is identical to CBR; reuse the same helper logic
  // so error semantics (transient flag, message) stay consistent.
  return assertCbrOnDisk(torrent, file)
}

function run7z(args: string[]): Promise<{ stdout: Buffer; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(SEVENZ_BIN, args)
    const stdoutChunks: Buffer[] = []
    let stderr = ''
    proc.stdout.on('data', (c: Buffer) => stdoutChunks.push(c))
    proc.stderr.on('data', (c: Buffer) => { stderr += c.toString() })
    proc.on('error', reject)
    proc.on('close', (code) => {
      resolve({ stdout: Buffer.concat(stdoutChunks), stderr, code: code ?? -1 })
    })
  })
}

interface SevenZEntry {
  path: string
  size: number
}

// Parse `7z l -slt` output. The -slt flag prints one attribute per line in
// `Key = Value` form, with blank lines between entries.
function parseSlt(text: string): SevenZEntry[] {
  const entries: SevenZEntry[] = []
  let cur: Partial<SevenZEntry> & { isDir?: boolean } = {}
  let inBody = false
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('----------')) {
      inBody = true
      continue
    }
    if (!inBody) continue
    if (line.trim() === '') {
      if (cur.path && !cur.isDir && typeof cur.size === 'number') {
        entries.push({ path: cur.path, size: cur.size })
      }
      cur = {}
      continue
    }
    const eq = line.indexOf('=')
    if (eq < 0) continue
    const key = line.slice(0, eq).trim()
    const value = line.slice(eq + 1).trim()
    if (key === 'Path') cur.path = value
    else if (key === 'Size') cur.size = Number(value)
    else if (key === 'Attributes' && value.startsWith('D')) cur.isDir = true
    else if (key === 'Folder' && value === '+') cur.isDir = true
  }
  return entries
}

// Listing a 7z spawns a process that scans the whole archive. openSevenZEntry
// needs the same (full-path, image-only, sorted) list to map an entry index to
// its archive path, so without memoization every page paid for a `7z l` on top
// of its `7z x`. Memoize by disk path (invalidated on size change).
const SEVENZ_LIST_MAX = 16
const sevenZLists = new Map<string, { size: number; entries: SevenZEntry[] }>()

async function getSevenZImageList(diskPath: string, size: number): Promise<SevenZEntry[]> {
  const cached = sevenZLists.get(diskPath)
  if (cached && cached.size === size) {
    sevenZLists.delete(diskPath)
    sevenZLists.set(diskPath, cached) // bump to most-recently-used
    return cached.entries
  }
  const { stdout, stderr, code } = await run7z(['l', '-slt', '--', diskPath])
  if (code !== 0) {
    throw new Error(`7z list failed (code ${code}): ${stderr.trim()}`)
  }
  const entries = parseSlt(stdout.toString())
    .filter((e) => classifyFile(e.path) === 'image')
    .sort((a, b) =>
      a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' }),
    )
  sevenZLists.set(diskPath, { size, entries })
  while (sevenZLists.size > SEVENZ_LIST_MAX) {
    const oldest = sevenZLists.keys().next().value
    if (oldest === undefined) break
    sevenZLists.delete(oldest)
  }
  return entries
}

export async function listSevenZEntries(
  torrent: WTTorrent,
  file: WTFile,
): Promise<ArchiveEntry[]> {
  const diskPath = reuseAssertOnDisk(torrent, file)
  const entries = await getSevenZImageList(diskPath, file.length)
  return entries.map((e, i) => ({
    index: i,
    name: path.posix.basename(e.path),
    size: e.size,
    mimeType: detectMime(e.path),
  }))
}

export async function openSevenZEntry(
  torrent: WTTorrent,
  file: WTFile,
  entryIndex: number,
): Promise<OpenedEntry> {
  const diskPath = reuseAssertOnDisk(torrent, file)
  // List first so we can map entryIndex (image-only, sorted) → archive path.
  const all = await getSevenZImageList(diskPath, file.length)
  const target = all[entryIndex]
  if (!target) {
    throw new Error(`entry ${entryIndex} out of range (${all.length} total)`)
  }
  // `7z x -so` streams a single named entry to stdout. We buffer it like CBZ
  // (comic pages are small) to keep the response path simple.
  const { stdout, stderr, code } = await run7z(['x', '-so', '--', diskPath, target.path])
  if (code !== 0) {
    throw new Error(`7z extract failed (code ${code}): ${stderr.trim()}`)
  }
  return {
    stream: Readable.from(stdout),
    mime: detectMime(target.path),
    length: stdout.length,
    name: path.posix.basename(target.path),
  }
}
