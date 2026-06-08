import type { ReactNode } from 'react'
import { AuthGuard } from '@/components/layout/AuthGuard'
import { AppChrome } from '@/components/layout/AppChrome'

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <AppChrome>{children}</AppChrome>
    </AuthGuard>
  )
}
