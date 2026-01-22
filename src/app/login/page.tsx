import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import LoginButton from './LoginButton'

export default async function LoginPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // If already logged in, go to dashboard
  if (user) {
    redirect('/dashboard')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950">
      <div className="max-w-md w-full space-y-8 p-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-white mb-2">Panel Flow</h1>
          <p className="text-zinc-400">Professional Comic Script Writing</p>
        </div>

        <LoginButton />

        <p className="text-center text-zinc-500 text-sm">
          Your scripts, structured and secure.
        </p>
      </div>
    </div>
  )
}
