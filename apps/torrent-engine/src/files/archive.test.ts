import { Readable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import yazl from 'yazl'
import type { WTFile } from '../torrent/engine.js'
import { listCbzEntries, openCbzEntry } from './archive.js'

async function buildCbz(entries: Array<{ name: string; body: Buffer }>): Promise<Buffer> {
  const zip = new yazl.ZipFile()
  for (const e of entries) {
    // `compress: false` mirrors real-world CBZ — images are already compressed
    // so the archive almost always uses the "store" method.
    zip.addBuffer(e.body, e.name, { compress: false })
  }
  zip.end()

  const chunks: Buffer[] = []
  return new Promise((resolve, reject) => {
    zip.outputStream.on('data', (c: Buffer) => chunks.push(c))
    zip.outputStream.on('end', () => resolve(Buffer.concat(chunks)))
    zip.outputStream.on('error', reject)
  })
}

function makeWTFile(buffer: Buffer, name = 'test.cbz'): WTFile {
  return {
    name,
    path: name,
    length: buffer.length,
    select: () => {},
    deselect: () => {},
    createReadStream: (opts) => {
      const start = opts?.start ?? 0
      const end = opts?.end ?? buffer.length - 1
      return Readable.from(buffer.subarray(start, end + 1))
    },
  }
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks)
}

// Minimal PNG bytes; we only need something non-empty that passes detectors —
// actual image validity isn't part of the archive module's contract.
const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489000000' +
    '0d49444154789c636000010000050001a5f645400000000049454e44ae426082',
  'hex',
)
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xd9])

describe('archive', () => {
  it('lists image entries in natural order and skips non-images', async () => {
    const buf = await buildCbz([
      { name: 'notes.txt', body: Buffer.from('ignore me') },
      { name: 'chapter/10.png', body: PNG },
      { name: 'chapter/2.png', body: PNG },
      { name: 'chapter/1.jpg', body: JPG },
    ])
    const file = makeWTFile(buf)
    const entries = await listCbzEntries(file)

    expect(entries.map((e) => e.name)).toEqual(['1.jpg', '2.png', '10.png'])
    expect(entries[0].mimeType).toBe('image/jpeg')
    expect(entries[2].mimeType).toBe('image/png')
    expect(entries.every((e) => e.size > 0)).toBe(true)
  })

  it('opens an entry and streams the stored bytes', async () => {
    const buf = await buildCbz([
      { name: 'a.png', body: PNG },
      { name: 'b.jpg', body: JPG },
    ])
    const file = makeWTFile(buf)
    const opened = await openCbzEntry(file, 1)

    expect(opened.name).toBe('b.jpg')
    expect(opened.mime).toBe('image/jpeg')
    expect(opened.length).toBe(JPG.length)
    const bytes = await streamToBuffer(opened.stream)
    expect(bytes.equals(JPG)).toBe(true)
  })

  it('rejects out-of-range entry index', async () => {
    const buf = await buildCbz([{ name: 'only.png', body: PNG }])
    const file = makeWTFile(buf)
    await expect(openCbzEntry(file, 5)).rejects.toThrow(/out of range/)
  })
})
