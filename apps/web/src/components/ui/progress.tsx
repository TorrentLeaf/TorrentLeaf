'use client'

import * as React from 'react'
import * as ProgressPrimitive from '@radix-ui/react-progress'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

// Status variants for the dashboard transfer table (tokens.md §5):
// info = downloading (cyan + glow), success = seeding (green + glow),
// muted = paused. `accent` is the original look — kept as default so existing
// product usages render exactly as before.
const indicatorVariants = cva('h-full w-full flex-1 transition-transform', {
  variants: {
    variant: {
      accent: 'bg-accent',
      info: 'bg-info shadow-[0_0_8px_hsl(var(--info)/0.5)]',
      success: 'bg-success shadow-[0_0_8px_hsl(var(--success)/0.5)]',
      muted: 'bg-foreground/15',
    },
  },
  defaultVariants: { variant: 'accent' },
})

export type ProgressProps = React.ComponentPropsWithoutRef<
  typeof ProgressPrimitive.Root
> &
  VariantProps<typeof indicatorVariants>

export const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  ProgressProps
>(({ className, value, variant, ...props }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    className={cn(
      'relative h-1.5 w-full overflow-hidden rounded-full bg-surface-2',
      className,
    )}
    {...props}
  >
    <ProgressPrimitive.Indicator
      className={indicatorVariants({ variant })}
      style={{ transform: `translateX(-${100 - (value ?? 0)}%)` }}
    />
  </ProgressPrimitive.Root>
))
Progress.displayName = ProgressPrimitive.Root.displayName
