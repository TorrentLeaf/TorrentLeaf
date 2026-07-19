'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

/**
 * Registers TorrentLeaf as the browser's handler for magnet: links, so clicking
 * a magnet on any site opens /add prefilled and ready to confirm. The browser
 * shows its own permission prompt; we only request it.
 */
export function RegisterMagnetHandler() {
  const [done, setDone] = useState(false)

  function register() {
    try {
      navigator.registerProtocolHandler('magnet', `${window.location.origin}/add?magnet=%s`)
      setDone(true)
    } catch {
      setDone(false)
    }
  }

  return (
    <Button variant="secondary" onClick={register} type="button">
      {done ? 'Handler requested — confirm in your browser' : 'Open magnet links in TorrentLeaf'}
    </Button>
  )
}
