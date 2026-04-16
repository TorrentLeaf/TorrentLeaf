'use client'

import Link from 'next/link'
import { Leaf, Library, Plus, LogIn } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/auth'

export function Navbar() {
  const user = useAuthStore((s) => s.user)

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur">
      <div className="container mx-auto flex h-14 items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <Leaf className="h-5 w-5 text-accent" />
          <span className="tracking-tight">TorrentLeaf</span>
        </Link>

        <nav className="flex items-center gap-1">
          <Button asChild variant="ghost" size="sm">
            <Link href="/">
              <Library className="mr-2 h-4 w-4" />
              Library
            </Link>
          </Button>
          <Button asChild variant="default" size="sm">
            <Link href="/add">
              <Plus className="mr-2 h-4 w-4" />
              Add
            </Link>
          </Button>
          {!user && (
            <Button asChild variant="outline" size="sm">
              <Link href="/login">
                <LogIn className="mr-2 h-4 w-4" />
                Sign in
              </Link>
            </Button>
          )}
          {user && (
            <span className="ml-2 text-sm text-muted-foreground">{user.username}</span>
          )}
        </nav>
      </div>
    </header>
  )
}
