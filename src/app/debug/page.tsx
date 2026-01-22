'use client'

import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'

export default function DebugPage() {
  const [session, setSession] = useState<any>(null)
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const checkAuth = async () => {
      const supabase = createClient()

      const { data: { session } } = await supabase.auth.getSession()
      const { data: { user } } = await supabase.auth.getUser()

      setSession(session)
      setUser(user)
      setLoading(false)
    }

    checkAuth()
  }, [])

  if (loading) {
    return <div className="p-8 text-white bg-zinc-950 min-h-screen">Loading...</div>
  }

  return (
    <div className="p-8 text-white bg-zinc-950 min-h-screen">
      <h1 className="text-2xl font-bold mb-4">Auth Debug</h1>

      <div className="mb-4">
        <h2 className="text-lg font-semibold">Session:</h2>
        <pre className="bg-zinc-800 p-4 rounded text-sm overflow-auto">
          {session ? JSON.stringify(session, null, 2) : 'No session'}
        </pre>
      </div>

      <div className="mb-4">
        <h2 className="text-lg font-semibold">User:</h2>
        <pre className="bg-zinc-800 p-4 rounded text-sm overflow-auto">
          {user ? JSON.stringify(user, null, 2) : 'No user'}
        </pre>
      </div>

      <div className="mb-4">
        <h2 className="text-lg font-semibold">Cookies:</h2>
        <pre className="bg-zinc-800 p-4 rounded text-sm overflow-auto">
          {document.cookie || 'No cookies'}
        </pre>
      </div>
    </div>
  )
}
