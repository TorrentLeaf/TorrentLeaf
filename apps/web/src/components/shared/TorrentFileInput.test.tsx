import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { TorrentFileInput } from './TorrentFileInput'

describe('TorrentFileInput', () => {
  it('submits a selected .torrent file', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<TorrentFileInput onSubmit={onSubmit} />)
    const file = new File([new Uint8Array([0x64, 0x65])], 'x.torrent', { type: 'application/x-bittorrent' })
    await userEvent.upload(screen.getByLabelText(/torrent file/i), file)
    expect(onSubmit).toHaveBeenCalledWith(file)
  })

  it('rejects a non-.torrent file with an error', async () => {
    const onSubmit = vi.fn()
    render(<TorrentFileInput onSubmit={onSubmit} />)
    const file = new File(['x'], 'x.txt', { type: 'text/plain' })
    // Bypass the input's accept filter so our own JS validation is exercised.
    await userEvent.upload(screen.getByLabelText(/torrent file/i), file, { applyAccept: false })
    expect(onSubmit).not.toHaveBeenCalled()
    expect(await screen.findByText(/must be a \.torrent file/i)).toBeInTheDocument()
  })
})
