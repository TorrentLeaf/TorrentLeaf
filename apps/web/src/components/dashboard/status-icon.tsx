import { ArrowDown, ArrowUp, Pause } from 'lucide-react'
import type { TorrentStatus } from '@/lib/dashboard'
import { cn } from '@/lib/utils'

const STYLES: Record<TorrentStatus, string> = {
  dl: 'bg-info/15 text-info',
  se: 'bg-success/15 text-success',
  pa: 'bg-foreground/[0.06] text-foreground-subtle',
}

const ICONS: Record<TorrentStatus, typeof ArrowDown> = {
  dl: ArrowDown,
  se: ArrowUp,
  pa: Pause,
}

// 18px status disc shared by the table and the mobile cards.
export function StatusIcon({ status, className }: { status: TorrentStatus; className?: string }) {
  const Icon = ICONS[status]
  return (
    <span
      aria-hidden="true"
      className={cn('grid h-[18px] w-[18px] flex-shrink-0 place-items-center rounded-full', STYLES[status], className)}
    >
      <Icon className="h-2.5 w-2.5" strokeWidth={2.5} />
    </span>
  )
}
