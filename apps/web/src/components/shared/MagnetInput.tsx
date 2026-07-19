'use client'

import { useState, type FormEvent } from 'react'
import { Loader2, Magnet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const MAGNET_RE = /^magnet:\?xt=urn:btih:[a-fA-F0-9]{40}/

export interface MagnetInputProps {
  onSubmit: (magnetURI: string) => Promise<void> | void
  placeholder?: string
  defaultValue?: string
}

export function MagnetInput({
  onSubmit,
  placeholder = 'magnet:?xt=urn:btih:...',
  defaultValue,
}: MagnetInputProps) {
  const [value, setValue] = useState(defaultValue ?? '')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const trimmed = value.trim()

    if (!MAGNET_RE.test(trimmed)) {
      setError('Invalid magnet link — it must start with magnet:?xt=urn:btih:')
      return
    }

    setLoading(true)
    try {
      await onSubmit(trimmed)
      setValue('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add torrent')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Magnet className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/40" />
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            className="pl-10 font-mono text-sm"
            disabled={loading}
          />
        </div>
        <Button type="submit" disabled={loading || !value}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add'}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  )
}
