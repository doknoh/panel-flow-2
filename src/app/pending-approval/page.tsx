'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Tip } from '@/components/ui/Tip'

export default function PendingApprovalPage() {
  const [email, setEmail] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    const checkUser = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push('/login')
        return
      }

      setEmail(user.email || null)

      // Check if they're now approved
      const { data: allowed } = await supabase
        .from('allowed_users')
        .select('email')
        .eq('email', user.email)
        .single()

      if (allowed) {
        router.push('/dashboard')
      }
    }

    checkUser()
  }, [router])

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-[var(--bg-secondary)] rounded-xl p-8 text-center">
        <div className="text-5xl mb-4">⏳</div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">Access Pending</h1>
        <p className="text-[var(--text-secondary)] mb-6">
          Your account ({email}) is awaiting approval. You'll be able to access Panel Flow once an administrator approves your request.
        </p>
        <p className="text-[var(--text-muted)] text-sm mb-6">
          Please contact the administrator if you believe this is an error.
        </p>
        <Tip content="Sign out">
          <button
            onClick={handleSignOut}
            className="text-[var(--text-secondary)] text-sm underline hover-fade"
          >
            Sign out
          </button>
        </Tip>
      </div>
    </div>
  )
}
