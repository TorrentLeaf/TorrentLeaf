import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type Feature = {
  icon: ReactNode
  title: string
  description: string
}

export type FeatureBarProps = {
  features: Feature[]
  className?: string
}

// Responsive feature grid: 1 → 2 → 3 columns (base → md → lg). Each cell is an
// accent icon disc + title + copy. Presentational; the landing supplies the
// lucide icons and English copy.
export function FeatureBar({ features, className }: FeatureBarProps) {
  return (
    <section
      className={cn(
        'relative z-[3] grid grid-cols-1 gap-[18px] rounded-2xl border border-border',
        'bg-gradient-to-b from-black/40 to-black/20 p-5',
        'md:grid-cols-2 md:gap-5 md:rounded-[18px] md:p-6',
        'lg:grid-cols-3 lg:gap-6 lg:rounded-[20px] lg:px-8 lg:py-7',
        className,
      )}
    >
      {features.map((f) => (
        <div key={f.title} className="flex items-start gap-3.5">
          <div
            className={cn(
              'grid h-10 w-10 flex-shrink-0 place-items-center rounded-full text-accent md:h-11 md:w-11',
              'border border-accent/30',
              'bg-[radial-gradient(circle,hsl(var(--accent)/0.12),transparent_70%)]',
            )}
            aria-hidden="true"
          >
            {f.icon}
          </div>
          <div>
            <h3 className="mb-1 mt-0.5 text-[15px] font-semibold text-foreground">{f.title}</h3>
            <p className="text-[13px] leading-[1.5] text-muted-foreground">{f.description}</p>
          </div>
        </div>
      ))}
    </section>
  )
}
