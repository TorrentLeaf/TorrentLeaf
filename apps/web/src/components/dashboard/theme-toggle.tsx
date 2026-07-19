'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Moon } from 'lucide-react'
import { Toggle } from '@/components/ui/toggle'
import { cn } from '@/lib/utils'

// Sidebar "Dark theme" row backed by next-themes. The `mounted` guard avoids a
// hydration mismatch — next-themes resolves the active theme client-side, so on
// the server we optimistically render the dark (default) state.
export function ThemeToggle({ collapsed }: { collapsed?: boolean }) {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const isDark = !mounted || theme !== 'light'
  const itemBase =
    'flex w-full items-center gap-3 rounded-md border border-transparent px-3 py-2 text-left text-sm text-muted-foreground'
  return (
    <div className={cn(itemBase, 'cursor-default', collapsed && 'justify-center px-0 py-[9px]')}>
      <Moon className="h-4 w-4 flex-shrink-0 opacity-80" />
      <span className={cn('min-w-0 flex-1 truncate', collapsed && 'hidden')}>Dark theme</span>
      <Toggle
        checked={isDark}
        onCheckedChange={(v) => setTheme(v ? 'dark' : 'light')}
        aria-label="Dark theme"
        className={cn(collapsed && 'hidden')}
      />
    </div>
  )
}
