import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/ui/Header'

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
          <h2 className="text-xl sm:text-2xl font-semibold">Your Projects</h2>
          <Link
            href="/series/new"
            className="bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white px-4 py-2 rounded-lg font-medium transition-colors text-center sm:text-left"
          >
            + New Series
          </Link>
        </div>

        {seriesList && seriesList.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {seriesList.map((series) => (
              <Link
                key={series.id}
                href={`/series/${series.id}`}
                className="block bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-6 hover:border-[var(--border-strong)] transition-colors"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="text-lg font-semibold">{series.title}</h3>
                  {series.role !== 'owner' && (
                    <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${
                      series.role === 'editor'
                        ? 'bg-blue-500/20 text-blue-400'
                        : series.role === 'commenter'
                        ? 'bg-yellow-500/20 text-yellow-400'
                        : 'bg-gray-500/20 text-gray-400'
                    }`}>
                      {series.role === 'editor' ? 'Editor' : series.role === 'commenter' ? 'Commenter' : 'Viewer'}
                    </span>
                  )}
                </div>
                {series.logline && (
                  <p className="text-[var(--text-secondary)] text-sm line-clamp-2">{series.logline}</p>
                )}
                <p className="text-[var(--text-muted)] text-xs mt-4">
                  Updated {new Date(series.updated_at).toLocaleDateString()}
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-16 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg">
            <h3 className="text-xl font-medium mb-2">No projects yet</h3>
            <p className="text-[var(--text-secondary)] mb-6">Create your first comic series to get started</p>
            <Link
              href="/series/new"
              className="inline-block bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white px-6 py-3 rounded-lg font-medium transition-colors"
            >
              Create Your First Series
            </Link>
          </div>
        )}
      </main>
    </div>
  )
}
