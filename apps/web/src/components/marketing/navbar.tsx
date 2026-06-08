'use client'

import Link from 'next/link'
import { Leaf, Menu, X, ArrowRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerTrigger,
  DrawerTitle,
} from '@/components/ui/drawer'
import { cn } from '@/lib/utils'

const NAV_LINKS = [
  { label: 'Features', href: '#features' },
  { label: 'How it works', href: '#how' },
  { label: 'GitHub', href: '#' },
  { label: 'Docs', href: '#' },
] as const

// Where the "Open app" CTAs go — the real, authenticated app. Cast with
// `as never` to match the repo's typedRoutes convention for route-group paths
// (see components/layout/Navbar.tsx).
const APP_HREF = '/library' as never

function Brand() {
  return (
    <Link
      href="/"
      className="flex flex-shrink-0 items-center gap-2.5 text-[17px] font-bold tracking-[-0.01em] text-foreground md:text-[18px]"
    >
      <span
        className={cn(
          'grid h-7 w-7 place-items-center rounded-md border border-accent/25',
          'bg-[linear-gradient(135deg,hsl(var(--accent)/0.18),hsl(var(--accent)/0.04))]',
        )}
        aria-hidden="true"
      >
        <Leaf className="h-4 w-4 text-accent" />
      </span>
      TorrentLeaf
    </Link>
  )
}

const ctaShadow =
  'shadow-[0_8px_24px_-8px_hsl(var(--accent)/0.5),inset_0_1px_0_rgba(255,255,255,0.3)]'

export function Navbar() {
  return (
    <nav className="relative z-[5] flex items-center justify-between gap-3 px-5 py-5 md:px-8 lg:px-12 lg:py-7">
      <Brand />

      {/* Desktop links — lg+ */}
      <div className="hidden items-center gap-7 lg:flex">
        {NAV_LINKS.map((l) => (
          <Link
            key={l.label}
            href={l.href}
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {l.label}
          </Link>
        ))}
      </div>

      {/* Desktop CTA — lg+ */}
      <Button
        asChild
        className={cn('hidden rounded-full border border-accent/40 lg:inline-flex', ctaShadow)}
      >
        <Link href={APP_HREF}>
          Open app
          <ArrowRight className="ml-2 h-3 w-3" />
        </Link>
      </Button>

      {/* Hamburger + drawer — below lg */}
      <Drawer direction="right">
        <DrawerTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            aria-label="Open menu"
            className="h-9 w-9 rounded-md lg:hidden"
          >
            <Menu className="h-[18px] w-[18px]" />
          </Button>
        </DrawerTrigger>
        <DrawerContent side="right" className="gap-5 p-6">
          <DrawerTitle className="sr-only">Navigation menu</DrawerTitle>
          <div className="flex items-center justify-between">
            <Brand />
            <DrawerClose asChild>
              <Button variant="outline" size="icon" aria-label="Close menu" className="h-9 w-9 rounded-md">
                <X className="h-[18px] w-[18px]" />
              </Button>
            </DrawerClose>
          </div>

          <div className="mt-2 flex flex-col">
            {NAV_LINKS.map((l) => (
              <DrawerClose asChild key={l.label}>
                <Link
                  href={l.href}
                  className="border-b border-border py-3 text-base text-foreground"
                >
                  {l.label}
                </Link>
              </DrawerClose>
            ))}
          </div>

          <DrawerClose asChild>
            <Button asChild className="mt-auto rounded-lg border border-accent/40">
              <Link href={APP_HREF}>
                Open app
                <ArrowRight className="ml-2 h-3 w-3" />
              </Link>
            </Button>
          </DrawerClose>
        </DrawerContent>
      </Drawer>
    </nav>
  )
}
