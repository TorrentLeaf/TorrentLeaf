import type { Metadata } from 'next'
import { ArrowDownUp, Activity, SlidersHorizontal } from 'lucide-react'

import { PageShell } from '@/components/marketing/page-shell'
import { Navbar } from '@/components/marketing/navbar'
import { Hero } from '@/components/marketing/hero'
import { FeatureBar, type Feature } from '@/components/marketing/feature-bar'
import { LandingPreview } from '@/components/marketing/landing-preview'

export const metadata: Metadata = {
  title: 'TorrentLeaf — Read while it downloads',
  description:
    'Manga, PDFs and EPUBs streamed straight from the BitTorrent swarm. Start reading the first chapter in seconds — no full download required.',
}

const FEATURES: Feature[] = [
  {
    icon: <ArrowDownUp className="h-5 w-5" />,
    title: 'Instant stream',
    description:
      'Start reading before the download finishes. Sequential piece prioritisation grabs the bytes you need next.',
  },
  {
    icon: <Activity className="h-5 w-5" />,
    title: 'Torrent health',
    description:
      'See live seeds and peers for every file so you know the swarm is healthy before you commit to a download.',
  },
  {
    icon: <SlidersHorizontal className="h-5 w-5" />,
    title: 'Bandwidth control',
    description:
      'Cap download and upload speeds, or pin one title to the top of the queue when you need it sooner.',
  },
]

// Public marketing landing at `/`. Composes the marketing primitives; the
// animated dashboard preview replaces the placeholder in stage 07.
export default function LandingPage() {
  return (
    <main className="bg-background">
      <PageShell>
        <Navbar />
        <Hero />

        {/* Animated app preview — the SAME dashboard components as /library,
            driven by a mock RAF loop (reduced, non-interactive). */}
        <section id="how" className="relative z-[3] px-3 py-4 md:px-8 md:py-6 lg:px-12 lg:py-10">
          <div className="relative isolate mx-auto max-w-[1180px] xl:max-w-[1440px] 2xl:max-w-[1660px]">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -inset-x-4 -inset-y-8 -z-10 blur-[20px]"
              style={{
                backgroundImage: [
                  'radial-gradient(ellipse 50% 35% at 45% 50%, hsl(var(--info) / 0.18), transparent 65%)',
                  'radial-gradient(ellipse 40% 30% at 70% 45%, hsl(var(--accent) / 0.14), transparent 65%)',
                ].join(', '),
              }}
            />
            <LandingPreview />
          </div>
        </section>

        <FeatureBar
          features={FEATURES}
          className="mx-3 mb-6 mt-4 md:mx-8 md:mb-8 md:mt-6 lg:mx-12 lg:mb-12"
        />
      </PageShell>
    </main>
  )
}
