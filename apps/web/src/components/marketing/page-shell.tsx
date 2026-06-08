import type { ReactNode, CSSProperties } from 'react'
import { cn } from '@/lib/utils'

// Fine-grain noise texture (data URI ported from landing.reference.html .page-card::after).
// Decorative only — not a color/spacing value, so it lives in a style prop.
const GRAIN_URL =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")"

// Full-bleed background canvas: teal + cyan radial glows over a surface
// gradient, expressed via a token-based style object (every color is
// hsl(var(--token))). No frame (border/radius/shadow) — the landing spans the
// full viewport per the user's full-bleed choice.
const shellStyle: CSSProperties = {
  backgroundImage: [
    'radial-gradient(ellipse 50% 32% at 50% 12%, hsl(var(--accent) / 0.18), transparent 60%)',
    'radial-gradient(ellipse 42% 26% at 50% 34%, hsl(var(--info) / 0.10), transparent 65%)',
    'linear-gradient(180deg, hsl(var(--surface)) 0%, hsl(var(--surface-2)) 100%)',
  ].join(', '),
}

export type PageShellProps = {
  children: ReactNode
  className?: string
}

// Full-bleed marketing canvas: spans the full viewport (no max-width, border,
// radius or shadow), with the grain overlay above the radial glows.
export function PageShell({ children, className }: PageShellProps) {
  return (
    <div
      style={shellStyle}
      className={cn('relative min-h-screen w-full overflow-hidden', className)}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.03] mix-blend-overlay"
        style={{ backgroundImage: GRAIN_URL }}
      />
      {children}
    </div>
  )
}
