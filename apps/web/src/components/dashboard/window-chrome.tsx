import type { ReactNode } from 'react'
import { Minus, Square, X } from 'lucide-react'
import { cn } from '@/lib/utils'

// Top window title bar: brand dot-cluster + wordmark on the left. The right slot
// shows `trailing` (e.g. the user/login menu) when provided, otherwise the
// decorative traffic-light controls (hidden when `chromeless`).
export function WindowChrome({
  chromeless = false,
  trailing,
}: {
  chromeless?: boolean
  trailing?: ReactNode
}) {
  return (
    <div className="flex h-11 flex-shrink-0 items-center gap-4 border-b border-border bg-gradient-to-b from-foreground/[0.02] to-transparent px-4 text-sm text-muted-foreground">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.04em] text-foreground">
        <span className="grid h-4 w-4 grid-cols-2 gap-0.5" aria-hidden="true">
          <span className="rounded-full bg-accent" />
          <span className="rounded-full bg-accent opacity-50" />
          <span className="rounded-full bg-accent opacity-30" />
          <span className="rounded-full bg-accent opacity-70" />
        </span>
        TorrentLeaf
      </div>

      <div className="min-w-0 flex-1" />

      {trailing ? (
        <div className="flex flex-shrink-0 items-center">{trailing}</div>
      ) : (
        !chromeless && (
          <div className="flex gap-3.5 text-foreground-subtle">
            {[
              { label: 'minimize', Icon: Minus },
              { label: 'maximize', Icon: Square },
              { label: 'close', Icon: X },
            ].map(({ label, Icon }) => (
              <button
                key={label}
                type="button"
                aria-label={label}
                className={cn('transition-colors hover:text-foreground', 'focus-visible:outline-none focus-visible:text-foreground')}
              >
                <Icon className="h-3 w-3" />
              </button>
            ))}
          </div>
        )
      )}
    </div>
  )
}
