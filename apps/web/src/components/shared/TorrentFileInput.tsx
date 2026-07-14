'use client'

import { useState, type ChangeEvent } from 'react'
import { Loader2, Upload } from 'lucide-react'

export interface TorrentFileInputProps {
  onSubmit: (file: File) => Promise<void> | void
}

export function TorrentFileInput({ onSubmit }: TorrentFileInputProps) {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleChange(e: ChangeEvent<HTMLInputElement>) {
    setError(null)
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.torrent')) {
      setError('The file must be a .torrent file.')
      return
    }
    setLoading(true)
    try {
      await onSubmit(file)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add torrent')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      <label className="flex cursor-pointer items-center gap-3 rounded-md border border-dashed border-border px-4 py-6 text-sm text-muted-foreground transition-colors hover:border-accent/40 hover:text-foreground">
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
        <span>{loading ? 'Adding…' : 'Choose a .torrent file'}</span>
        <input
          type="file"
          accept=".torrent,application/x-bittorrent"
          className="sr-only"
          aria-label="Torrent file"
          onChange={handleChange}
          disabled={loading}
        />
      </label>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
