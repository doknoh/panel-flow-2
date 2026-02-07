import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import IssueGrid from './IssueGrid'
import CreateIssueButton from './CreateIssueButton'
import SeriesMetadata from './SeriesMetadata'
import Header from '@/components/ui/Header'
import ShareButton from './collaboration/ShareButton'
import CollaboratorAvatars from './collaboration/CollaboratorAvatars'
import { Calendar } from 'lucide-react'

export default async function SeriesPage({ params }: { params: Promise<{ seriesId: string }> }) {
  const { seriesId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  console.log('Series page - user:', user?.id, user?.email)

  if (!user) {
    redirect('/login')
  }

  // Fetch series first (simple query)
  const { data: series, error: seriesError } = await supabase
    .from('series')
    .select('*')
    .eq('id', seriesId)
    .single()

  // If series found, fetch issues separately
  let issues: any[] = []
  if (series) {
    const { data: issuesData } = await supabase
      .from('issues')
      .select('id, number, title, tagline, status, updated_at')
      .eq('series_id', seriesId)
      .order('number')
    issues = issuesData || []
  }

  console.log('Series page - series query result:', { series: series?.id, error: seriesError?.message, code: seriesError?.code })

  if (seriesError || !series) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Series Not Found</h1>
          <p className="text-[var(--text-secondary)] mb-4">This series doesn&apos;t exist or you don&apos;t have access.</p>
          <p className="text-[var(--text-muted)] text-xs mb-4">Debug: User={user?.id?.substring(0, 8)}... Error={seriesError?.message || 'none'}</p>
          <Link href="/dashboard" className="text-[var(--color-primary)] hover:underline">
            Back to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  // Fetch counts
  const [{ count: characterCount }, { count: locationCount }, { count: plotlineCount }] = await Promise.all([
    supabase.from('characters').select('*', { count: 'exact', head: true }).eq('series_id', seriesId),
    supabase.from('locations').select('*', { count: 'exact', head: true }).eq('series_id', seriesId),
    supabase.from('plotlines').select('*', { count: 'exact', head: true }).eq('series_id', seriesId),
  ])

  const counts = {
    characters: characterCount || 0,
    locations: locationCount || 0,
    plotlines: plotlineCount || 0,
  }

  // Check if user is the owner
  const isOwner = series.user_id === user.id

  // If not owner, get their collaboration role
  let userRole: 'owner' | 'editor' | 'commenter' | 'viewer' = isOwner ? 'owner' : 'viewer'
  if (!isOwner) {
    const { data: collab } = await supabase
      .from('series_collaborators')
      .select('role')
      .eq('series_id', seriesId)
      .eq('user_id', user.id)
      .single()

    if (collab) {
      userRole = collab.role as 'editor' | 'commenter' | 'viewer'
    }
  }

  const canEdit = userRole === 'owner' || userRole === 'editor'

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <Header showBackLink title={series.title}>
        <div className="flex items-center gap-4">
          <Link
            href={`/series/${seriesId}/deadlines`}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-lg transition-colors"
          >
            <Calendar className="w-4 h-4" />
            Deadlines
          </Link>
          <CollaboratorAvatars seriesId={seriesId} />
          {isOwner && <ShareButton seriesId={seriesId} seriesTitle={series.title} />}
        </div>
      </Header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Role badge for collaborators */}
        {!isOwner && (
          <div className="mb-4 flex items-center gap-2">
            <span className={`text-xs px-3 py-1 rounded-full ${
              userRole === 'editor'
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                : userRole === 'commenter'
                ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                : 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
            }`}>
              {userRole === 'editor' ? '✏️ Editor Access' : userRole === 'commenter' ? '💬 Commenter Access' : '👁️ View Only'}
            </span>
            <span className="text-xs text-[var(--text-muted)]">
              You're collaborating on this series
            </span>
          </div>
        )}

        {/* Series Info */}
        <SeriesMetadata
          seriesId={seriesId}
          initialLogline={series.logline}
          initialTheme={series.central_theme}
          initialVisualGrammar={series.visual_grammar}
          initialRules={series.rules}
          readOnly={!canEdit}
        />

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
            <div className="text-2xl font-bold">{issues?.length || 0}</div>
            <div className="text-[var(--text-muted)] text-sm">Issues</div>
          </div>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
            <div className="text-2xl font-bold">{counts.characters}</div>
            <div className="text-[var(--text-muted)] text-sm">Characters</div>
          </div>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
            <div className="text-2xl font-bold">{counts.locations}</div>
            <div className="text-[var(--text-muted)] text-sm">Locations</div>
          </div>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
            <div className="text-2xl font-bold">{counts.plotlines}</div>
            <div className="text-[var(--text-muted)] text-sm">Plotlines</div>
          </div>
        </div>

        {/* Issues Section */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Issues</h2>
            {canEdit && <CreateIssueButton seriesId={seriesId} issueCount={issues?.length || 0} />}
          </div>
          <IssueGrid issues={issues || []} seriesId={seriesId} />
        </div>

        {/* Series Tools */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4 text-[var(--text-secondary)]">Tools</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <Link
              href={`/series/${seriesId}/canvas`}
              className="bg-gradient-to-br from-amber-900/50 to-[var(--bg-secondary)] border border-amber-700/50 rounded-lg p-4 hover:border-amber-600 hover:from-amber-900/70 transition-colors group"
            >
              <div className="text-2xl mb-2 opacity-80 group-hover:opacity-100 transition-opacity">💭</div>
              <h3 className="font-medium mb-1 text-amber-200">Canvas</h3>
              <p className="text-amber-300/70 text-sm">Brainstorm fuzzy ideas</p>
            </Link>
            <Link
              href={`/series/${seriesId}/guide`}
              className="bg-gradient-to-br from-purple-900/50 to-[var(--bg-secondary)] border border-purple-700/50 rounded-lg p-4 hover:border-purple-600 hover:from-purple-900/70 transition-colors group"
            >
              <div className="text-2xl mb-2 opacity-80 group-hover:opacity-100 transition-opacity">🎭</div>
              <h3 className="font-medium mb-1 text-purple-200">Guide</h3>
              <p className="text-purple-300/70 text-sm">AI-guided writing sessions</p>
            </Link>
            <Link
              href={`/series/${seriesId}/outline`}
              className="bg-gradient-to-br from-indigo-900/50 to-[var(--bg-secondary)] border border-indigo-700/50 rounded-lg p-4 hover:border-indigo-600 hover:from-indigo-900/70 transition-colors group"
            >
              <div className="text-2xl mb-2 opacity-80 group-hover:opacity-100 transition-opacity">📋</div>
              <h3 className="font-medium mb-1 text-indigo-200">Series Outline</h3>
              <p className="text-indigo-300/70 text-sm">Timeline view & plotline tracking</p>
            </Link>
            <Link
              href={`/series/${seriesId}/weave`}
              className="bg-gradient-to-br from-rose-900/50 to-[var(--bg-secondary)] border border-rose-700/50 rounded-lg p-4 hover:border-rose-600 hover:from-rose-900/70 transition-colors group"
            >
              <div className="text-2xl mb-2 opacity-80 group-hover:opacity-100 transition-opacity">🧬</div>
              <h3 className="font-medium mb-1 text-rose-200">Series Weave</h3>
              <p className="text-rose-300/70 text-sm">Plotlines across all issues</p>
            </Link>
            <Link
              href={`/series/${seriesId}/analytics`}
              className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4 hover:border-[var(--border-strong)] hover:bg-[var(--bg-tertiary)] transition-colors group"
            >
              <div className="text-2xl mb-2 opacity-60 group-hover:opacity-100 transition-opacity">📊</div>
              <h3 className="font-medium mb-1">Analytics</h3>
              <p className="text-[var(--text-muted)] text-sm">Stats, progress, and insights</p>
            </Link>
            <Link
              href={`/series/${seriesId}/sessions`}
              className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4 hover:border-[var(--border-strong)] hover:bg-[var(--bg-tertiary)] transition-colors group"
            >
              <div className="text-2xl mb-2 opacity-60 group-hover:opacity-100 transition-opacity">🕐</div>
              <h3 className="font-medium mb-1">Session History</h3>
              <p className="text-[var(--text-muted)] text-sm">Track progress and loose ends</p>
            </Link>
            <Link
              href={`/series/${seriesId}/continuity`}
              className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4 hover:border-[var(--border-strong)] hover:bg-[var(--bg-tertiary)] transition-colors group"
            >
              <div className="text-2xl mb-2 opacity-60 group-hover:opacity-100 transition-opacity">🔍</div>
              <h3 className="font-medium mb-1">Continuity Check</h3>
              <p className="text-[var(--text-muted)] text-sm">Detect errors and inconsistencies</p>
            </Link>
            <Link
              href={`/series/${seriesId}/patterns`}
              className="bg-gradient-to-br from-cyan-900/50 to-[var(--bg-secondary)] border border-cyan-700/50 rounded-lg p-4 hover:border-cyan-600 hover:from-cyan-900/70 transition-colors group"
            >
              <div className="text-2xl mb-2 opacity-80 group-hover:opacity-100 transition-opacity">🕸️</div>
              <h3 className="font-medium mb-1 text-cyan-200">Patterns</h3>
              <p className="text-cyan-300/70 text-sm">Cross-issue weaving</p>
            </Link>
            <Link
              href={`/series/${seriesId}/notes`}
              className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4 hover:border-[var(--border-strong)] hover:bg-[var(--bg-tertiary)] transition-colors group"
            >
              <div className="text-2xl mb-2 opacity-60 group-hover:opacity-100 transition-opacity">📝</div>
              <h3 className="font-medium mb-1">Project Notes</h3>
              <p className="text-[var(--text-muted)] text-sm">Questions, decisions, insights</p>
            </Link>
          </div>
        </div>

        {/* World Building */}
        <div>
          <h2 className="text-lg font-semibold mb-4 text-[var(--text-secondary)]">World Building</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Link
              href={`/series/${seriesId}/characters`}
              className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4 hover:border-[var(--border-strong)] hover:bg-[var(--bg-tertiary)] transition-colors group"
            >
              <div className="text-2xl mb-2 opacity-60 group-hover:opacity-100 transition-opacity">👤</div>
              <h3 className="font-medium mb-1">Characters</h3>
              <p className="text-[var(--text-muted)] text-sm">Manage character database</p>
            </Link>
            <Link
              href={`/series/${seriesId}/character-arcs`}
              className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4 hover:border-[var(--border-strong)] hover:bg-[var(--bg-tertiary)] transition-colors group"
            >
              <div className="text-2xl mb-2 opacity-60 group-hover:opacity-100 transition-opacity">📈</div>
              <h3 className="font-medium mb-1">Character Arcs</h3>
              <p className="text-[var(--text-muted)] text-sm">Track emotional journeys</p>
            </Link>
            <Link
              href={`/series/${seriesId}/locations`}
              className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4 hover:border-[var(--border-strong)] hover:bg-[var(--bg-tertiary)] transition-colors group"
            >
              <div className="text-2xl mb-2 opacity-60 group-hover:opacity-100 transition-opacity">🏛️</div>
              <h3 className="font-medium mb-1">Locations</h3>
              <p className="text-[var(--text-muted)] text-sm">Manage location database</p>
            </Link>
            <Link
              href={`/series/${seriesId}/plotlines`}
              className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4 hover:border-[var(--border-strong)] hover:bg-[var(--bg-tertiary)] transition-colors group"
            >
              <div className="text-2xl mb-2 opacity-60 group-hover:opacity-100 transition-opacity">🧵</div>
              <h3 className="font-medium mb-1">Plotlines</h3>
              <p className="text-[var(--text-muted)] text-sm">Define narrative threads</p>
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
