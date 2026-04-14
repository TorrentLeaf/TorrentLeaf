import type { ReactNode } from 'react'
import Link from 'next/link'
import { Leaf } from 'lucide-react'

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <Link href="/" className="mb-8 flex items-center gap-2 text-lg font-semibold">
        <Leaf className="h-6 w-6 text-accent" />
        TorrentLeaf
      </Link>
      <div className="w-full max-w-md">{children}</div>
    </div>
  )
}
