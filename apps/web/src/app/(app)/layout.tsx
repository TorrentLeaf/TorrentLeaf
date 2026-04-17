import type { ReactNode } from 'react'
import { Navbar } from '@/components/layout/Navbar'
import { AuthGuard } from '@/components/layout/AuthGuard'

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <Navbar />
        <main className="container mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
      </div>
    </AuthGuard>
  )
}
