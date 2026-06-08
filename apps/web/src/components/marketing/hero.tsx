import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const APP_HREF = '/library' as never

const ctaGlow =
  'shadow-[0_12px_32px_-10px_hsl(var(--accent)/0.55),inset_0_1px_0_rgba(255,255,255,0.3)]'

// Marketing hero: eyebrow pill, clamp() gradient headline, subcopy, two CTAs.
// Server component — no state. Text values come from landing.reference.html.
export function Hero() {
  return (
    <header className="relative z-[4] px-5 pb-6 pt-6 text-center md:px-8 md:pb-8 md:pt-12 lg:px-12 lg:pt-16">
      <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-foreground/[0.03] py-[5px] pl-[5px] pr-3 text-[11px] text-muted-foreground md:mb-7 md:text-[12px]">
        <span className="rounded-full bg-accent/15 px-2 py-[3px] text-[10px] font-semibold tracking-[0.02em] text-accent">
          v0.4
        </span>
        Sequential streaming · zero-wait reading
      </span>

      <h1 className="mb-4 text-balance text-[clamp(34px,7.5vw,72px)] font-bold leading-[1.05] tracking-[-0.035em] md:mb-5">
        <span className="bg-gradient-to-b from-foreground to-foreground/70 bg-clip-text text-transparent">
          Read while it
        </span>
        <br />
        <span className="bg-gradient-to-b from-accent to-accent-hover bg-clip-text text-transparent">
          downloads.
        </span>
      </h1>

      <p className="mx-auto mb-7 max-w-[560px] text-pretty text-[clamp(14px,1.6vw,17px)] leading-[1.55] text-muted-foreground md:mb-9">
        Manga, PDFs and EPUBs streamed straight from torrent. TorrentLeaf prioritises the bytes
        you need next — start reading the first chapter in seconds, no matter how big the archive.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-2.5">
        <Button
          asChild
          size="lg"
          className={cn('rounded-lg border border-accent/40 transition-transform hover:-translate-y-px', ctaGlow)}
        >
          <Link href={APP_HREF}>
            Open the app
            <ArrowRight className="ml-2 h-3.5 w-3.5" />
          </Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="rounded-lg">
          <Link href="#how">See how it works</Link>
        </Button>
      </div>
    </header>
  )
}
