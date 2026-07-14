import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider, useTheme } from 'next-themes'
import { describe, it, expect } from 'vitest'
import { ThemeToggle } from './theme-toggle'

function ThemeProbe() {
  const { theme } = useTheme()
  return <span data-testid="theme">{theme}</span>
}

describe('ThemeToggle', () => {
  it('flips the theme when toggled', async () => {
    render(
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
        <ThemeToggle />
        <ThemeProbe />
      </ThemeProvider>,
    )
    expect(screen.getByTestId('theme')).toHaveTextContent('dark')
    await userEvent.click(screen.getByRole('switch', { name: /dark theme/i }))
    expect(screen.getByTestId('theme')).toHaveTextContent('light')
  })
})
