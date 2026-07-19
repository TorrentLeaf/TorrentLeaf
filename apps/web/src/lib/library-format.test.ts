import { describe, it, expect } from 'vitest'
import { countByFormat, LIBRARY_FORMATS } from './library-format'

describe('countByFormat', () => {
  it('counts cards per format and zero-fills the rest', () => {
    const cards = [
      { format: 'comics' }, { format: 'comics' }, { format: 'pdfs' },
    ] as { format: 'comics' | 'pdfs' }[]
    const counts = countByFormat(cards as never)
    expect(counts.comics).toBe(2)
    expect(counts.pdfs).toBe(1)
    expect(counts.books).toBe(0)
    expect(counts.video).toBe(0)
    expect(counts.other).toBe(0)
    expect(LIBRARY_FORMATS).toHaveLength(5)
  })
})
