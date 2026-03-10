'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/contexts/ToastContext'
import { useRouter, usePathname } from 'next/navigation'

/**
 * Listens for auth state changes (token expiry, sign out)
 * and gracefully redirects to login with a toast notification.
 * Wrap this inside Providers so it has access to toast context.
 */
export default function AuthGuard() {
  const { showToast } = useToast()
  const router = useRouter()
  const pathname = usePathname()
  const hasShownExpiry = useRef(false)

  useEffect(() => {
    const supabase = createClient()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      // Don't redirect if already on login/public pages
      if (pathname === '/login' || pathname === '/') return

      if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
        if (event === 'SIGNED_OUT' && !hasShownExpiry.current) {
          hasShownExpiry.current = true
          showToast('Session expired. Please sign in again.', 'error')
          router.push('/login')
        }
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [showToast, router, pathname])

  return null
}
