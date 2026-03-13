import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/ui/Header'
import { Tip } from '@/components/ui/Tip'
import AllowedUsersManager from './AllowedUsersManager'

interface SeriesWithRole {
  id: string
  title: string
  logline: string | null
  updated_at: string
  user_id: string
  role: 'owner' | 'editor' | 'commenter' | 'viewer'
}

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch user's own series
  const { data: ownedSeries } = await supabase
    .from('series')
    .select('id, title, logline, updated_at, user_id')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })

  // Fetch series where user is a collaborator
  const { data: collaborations } = await supabase
    .from('series_collaborators')
    .select(`
      role,
      accepted_at,
      series:series_id (
        id,
        title,
        logline,
        updated_at,
        user_id
      )
    `)
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)

  // Combine and format series list
  const ownedWithRole: SeriesWithRole[] = (ownedSeries || []).map(s => ({
    ...s,
    role: 'owner' as const,
  }))

  const sharedWithRole: SeriesWithRole[] = (collaborations || [])
    .filter(c => c.series) // Filter out any with missing series data
    .map(c => ({
      ...(c.series as any),
      role: c.role as 'editor' | 'commenter' | 'viewer',
    }))

  // Combine and sort by updated_at
  const seriesList = [...ownedWithRole, ...sharedWithRole].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  )

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <Header userEmail={user.email} />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 sm:mb-8">
          <h2 className="type-title">YOUR PROJECTS</h2>
          <Tip content="Create new series">
            <Link
              href="/series/new"
              className="hover-lift type-label px-4 py-2 border border-[var(--border)] hover:border-[var(--text-primary)] bg-transparent text-[var(--text-primary)] text-center sm:text-left"
            >
              [+ NEW SERIES]
            </Link>
          </Tip>
        </div>

        {seriesList && seriesList.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 stagger-children">
            {seriesList.map((series) => (
              <Link
                key={series.id}
                href={`/series/${series.id}`}
                className="hover-glow block bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-6 hover:border-[var(--border-strong)] hover:shadow-[0_4px_12px_color-mix(in_srgb,var(--text-primary)_10%,transparent)] hover:-translate-y-0.5 transition-all duration-200"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="text-xl font-extrabold tracking-tighter">{series.title}</h3>
                  {series.role !== 'owner' && (
                    <span className={`type-micro px-2 py-0.5 border flex-shrink-0 ${
                      series.role === 'editor'
                        ? 'text-[var(--color-primary)] border-[var(--color-primary)]/30'
                        : series.role === 'commenter'
                        ? 'text-[var(--color-warning)] border-[var(--color-warning)]/30'
                        : 'text-[var(--text-muted)] border-[var(--border)]'
                    }`}>
                      {series.role === 'editor' ? 'EDITOR' : series.role === 'commenter' ? 'COMMENTER' : 'VIEWER'}
                    </span>
                  )}
                </div>
                {series.logline && (
                  <p className="text-[var(--text-secondary)] text-sm line-clamp-2">{series.logline}</p>
                )}
                <p className="type-micro text-[var(--text-muted)] mt-4">
                  UPDATED {new Date(series.updated_at).toLocaleDateString().toUpperCase()}
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-16 bg-[var(--bg-secondary)] border border-[var(--border)]">
            <h3 className="type-section mb-2">NO PROJECTS YET</h3>
            <p className="type-meta text-[var(--text-secondary)] mb-6">Create your first comic series to get started</p>
            <Tip content="Create new series">
              <Link
                href="/series/new"
                className="hover-lift type-label inline-block px-6 py-3 border border-[var(--border)] hover:border-[var(--text-primary)] text-[var(--text-primary)]"
              >
                [+ CREATE SERIES]
              </Link>
            </Tip>
          </div>
        )}

        {/* Admin: App Access Management */}
        <AllowedUsersManager currentUserEmail={user.email || ''} />
      </main>
    </div>
  )
}
