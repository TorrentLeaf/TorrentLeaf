import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'

import { TorrentCard } from './TorrentCard'
import { RegisterMagnetHandler } from './RegisterMagnetHandler'
import type { LibraryCard } from '@/lib/library'

function card(overrides: Partial<LibraryCard> = {}): LibraryCard {
  return {
    id: 'l1', sessionId: 's1', title: 'One Piece', type: 'manga', format: 'comics',
    addedAt: '2026-01-01T00:00:00Z', isFavorite: false, currentPage: 5, totalPages: 20, ...overrides,
  }
}

describe('TorrentCard', () => {
  it('renders title, type label and progress', () => {
    render(<TorrentCard card={card()} />)
    expect(screen.getByText('One Piece')).toBeInTheDocument()
    expect(screen.getByText('Manga')).toBeInTheDocument()
  })

  it('toggles favorite', async () => {
    const onToggleFavorite = vi.fn()
    render(<TorrentCard card={card()} onToggleFavorite={onToggleFavorite} />)
    await userEvent.click(screen.getByLabelText('Add to favorites'))
    expect(onToggleFavorite).toHaveBeenCalledWith('l1', false)
  })

  it('confirms deletion through the dialog', async () => {
    const onDelete = vi.fn()
    render(<TorrentCard card={card()} onDelete={onDelete} />)
    await userEvent.click(screen.getByLabelText('More options'))
    // The menu's Delete entry opens the confirm dialog.
    await userEvent.click(screen.getAllByText(/delete/i)[0])
    // Confirm button inside the dialog.
    const confirm = screen.getAllByRole('button', { name: /delete/i }).at(-1)!
    await userEvent.click(confirm)
    expect(onDelete).toHaveBeenCalledWith('s1')
  })
})

describe('RegisterMagnetHandler', () => {
  it('requests the protocol handler on click', async () => {
    const spy = vi.fn()
    ;(navigator as unknown as { registerProtocolHandler: unknown }).registerProtocolHandler = spy
    render(<RegisterMagnetHandler />)
    await userEvent.click(screen.getByRole('button', { name: /open magnet links/i }))
    expect(spy).toHaveBeenCalledWith('magnet', expect.stringContaining('/add?magnet=%s'))
    // Button label flips to the confirmation state.
    expect(screen.getByText(/confirm in your browser/i)).toBeInTheDocument()
  })

  it('stays unconfirmed if the browser throws', async () => {
    ;(navigator as unknown as { registerProtocolHandler: unknown }).registerProtocolHandler = () => {
      throw new Error('blocked')
    }
    render(<RegisterMagnetHandler />)
    await userEvent.click(screen.getByRole('button', { name: /open magnet links/i }))
    expect(screen.getByText(/open magnet links/i)).toBeInTheDocument()
  })
})
