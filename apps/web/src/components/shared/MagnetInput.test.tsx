import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { MagnetInput } from './MagnetInput'

const VALID = 'magnet:?xt=urn:btih:3f68a5998a4237e0613229235c27ab17e84dbef3'

describe('MagnetInput', () => {
  it('shows the real error message when onSubmit rejects', async () => {
    const onSubmit = vi.fn().mockRejectedValue(
      new Error('not enough free disk space (2.5 GB free, minimum 5 GB)'),
    )
    render(<MagnetInput onSubmit={onSubmit} />)
    await userEvent.type(screen.getByPlaceholderText(/magnet:/i), VALID)
    await userEvent.click(screen.getByRole('button', { name: /add/i }))
    expect(await screen.findByText(/not enough free disk space/i)).toBeInTheDocument()
  })

  it('prefills from defaultValue', () => {
    render(<MagnetInput onSubmit={vi.fn()} defaultValue={VALID} />)
    expect(screen.getByDisplayValue(VALID)).toBeInTheDocument()
  })
})
