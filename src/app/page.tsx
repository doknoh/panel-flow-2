import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // If logged in, go to dashboard
  if (user) {
    redirect('/dashboard')
  }

  // Otherwise show landing page
  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] flex flex-col items-center justify-center px-6">
      <div className="max-w-2xl text-center space-y-8">
        <h1 className="text-5xl font-bold">Panel Flow</h1>
        <p className="text-xl text-[var(--text-secondary)]">
          Professional comic script writing, structured and streamlined.
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/login"
            className="bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white px-8 py-3 rounded-lg font-medium transition-colors"
          >
            Get Started
          </Link>
        </div>
        <p className="text-[var(--text-muted)] text-sm">
          Panels. Pages. Scenes. Issues. Series. All in one place.
        </p>
      </div>
    </div>
  )
}
