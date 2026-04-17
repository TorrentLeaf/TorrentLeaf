'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'

/**
 * AuthGuard redirects to /login when there is no stored access token.
 * It renders nothing on the first client tick to avoid a hydration flash
 * (the Zustand persisted store is only available after the first mount).
 */
export function AuthGuard({ children }: { children: ReactNode }) {
  const router = useRouter()
  const accessToken = useAuthStore((s) => s.accessToken)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (hydrated && !accessToken) {
      router.replace('/login')
    }
  }, [hydrated, accessToken, router])

  if (!hydrated || !accessToken) {
    return null
  }

  return <>{children}</>
}
