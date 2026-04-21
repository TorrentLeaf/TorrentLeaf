'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Leaf, Library, Plus, LogIn, LogOut, ChevronDown } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/auth'

function UserMenu() {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)
  const user = useAuthStore((s) => s.user)
  const refreshToken = useAuthStore((s) => s.refreshToken)
  const clear = useAuthStore((s) => s.clear)

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function logout() {
    setOpen(false)
    // Best-effort revoke; we always clear local state even if the call fails
    // (network down, server gone, token already expired — doesn't matter).
    try {
      await api.post('/auth/logout', { refreshToken })
    } catch {
      // swallow — local clear is authoritative for the UI
    }
    clear()
    router.replace('/login')
  }

  if (!user) return null

  return (
    <div ref={containerRef} className="relative ml-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-accent/10 hover:text-foreground"
      >
        {user.username}
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1 w-40 rounded-md border border-border bg-background p-1 shadow-md"
        >
          <button
            type="button"
            role="menuitem"
            onClick={logout}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent/10"
          >
            <LogOut className="h-4 w-4" />
            Log out
          </button>
        </div>
      )}
    </div>
  )
}

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
            <Link href={'/library' as never}>
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
          <UserMenu />
        </nav>
      </div>
    </header>
  )
}
