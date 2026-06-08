'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

// Small switch matching `.toggle` in design styles.reference.css:
// 26x14 track, 10px thumb, accent when on. @radix-ui/react-switch is not a
// dependency, so this is a lightweight role="switch" button — focusable and
// operable (Space/Enter) for the a11y pass in stage 09.
export type ToggleProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'onChange'
> & {
  checked: boolean
  onCheckedChange?: (checked: boolean) => void
}

export const Toggle = React.forwardRef<HTMLButtonElement, ToggleProps>(
  ({ checked, onCheckedChange, className, disabled, onClick, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={(e) => {
        onClick?.(e)
        if (!e.defaultPrevented) onCheckedChange?.(!checked)
      }}
      className={cn(
        'relative inline-flex h-[14px] w-[26px] flex-shrink-0 items-center rounded-full',
        'transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2',
        'focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-accent/35' : 'bg-foreground/10',
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute left-0.5 top-0.5 h-2.5 w-2.5 rounded-full',
          'transition-all duration-200',
          checked ? 'translate-x-3 bg-accent' : 'translate-x-0 bg-foreground-subtle',
        )}
      />
    </button>
  ),
)
Toggle.displayName = 'Toggle'
