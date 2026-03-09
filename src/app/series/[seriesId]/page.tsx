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
import CommandPalette from '@/components/CommandPalette'

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
          <h1 className="type-title mb-2">SERIES NOT FOUND</h1>
          <p className="type-meta text-[var(--text-secondary)] mb-4">This series doesn&apos;t exist or you don&apos;t have access.</p>
          <p className="type-micro text-[var(--text-muted)] mb-4">DEBUG: USER={user?.id?.substring(0, 8)}... ERROR={seriesError?.message || 'none'}</p>
          <Link href="/dashboard" className="type-meta text-[var(--color-primary)] hover:underline">
            BACK TO DASHBOARD
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
            className="type-micro flex items-center gap-2 px-3 py-1.5 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] border border-[var(--border)] active:scale-[0.97] transition-all duration-150 ease-out"
          >
            <Calendar className="w-3.5 h-3.5" />
            DEADLINES
          </Link>
          <CollaboratorAvatars seriesId={seriesId} />
          {isOwner && <ShareButton seriesId={seriesId} seriesTitle={series.title} />}
        </div>
      </Header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Role badge for collaborators */}
        {!isOwner && (
          <div className="mb-4 flex items-center gap-2">
            <span className={`type-micro px-3 py-1 border ${
              userRole === 'editor'
                ? 'text-[var(--color-primary)] border-[var(--color-primary)]/30'
                : userRole === 'commenter'
                ? 'text-[var(--color-warning)] border-[var(--color-warning)]/30'
                : 'text-[var(--text-muted)] border-[var(--border)]'
            }`}>
              {userRole === 'editor' ? 'EDITOR ACCESS' : userRole === 'commenter' ? 'COMMENTER ACCESS' : 'VIEW ONLY'}
            </span>
            <span className="type-micro text-[var(--text-muted)]">
              COLLABORATING ON THIS SERIES
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

        {/* Quick Stats — Swiss big numbers */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 stagger-children">
          <div className="bg-[var(--bg-secondary)] border border-[var(--border)] p-4 rounded-lg">
            <div className="text-4xl font-black tabular-nums tracking-tighter leading-none">{issues?.length || 0}</div>
            <div className="type-micro text-[var(--text-muted)] mt-1">ISSUES</div>
          </div>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border)] p-4 rounded-lg">
            <div className="text-4xl font-black tabular-nums tracking-tighter leading-none">{counts.characters}</div>
            <div className="type-micro text-[var(--text-muted)] mt-1">CHARACTERS</div>
          </div>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border)] p-4 rounded-lg">
            <div className="text-4xl font-black tabular-nums tracking-tighter leading-none">{counts.locations}</div>
            <div className="type-micro text-[var(--text-muted)] mt-1">LOCATIONS</div>
          </div>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border)] p-4 rounded-lg">
            <div className="text-4xl font-black tabular-nums tracking-tighter leading-none">{counts.plotlines}</div>
            <div className="type-micro text-[var(--text-muted)] mt-1">PLOTLINES</div>
          </div>
        </div>

        {/* Issues Section */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="type-section text-base">ISSUES</h2>
            {canEdit && <CreateIssueButton seriesId={seriesId} issueCount={issues?.length || 0} />}
          </div>
          <IssueGrid issues={issues || []} seriesId={seriesId} />
        </div>

        {/* Series Tools */}
        <div className="mb-8">
          <h2 className="type-section text-base mb-4">TOOLS</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 stagger-children">
            <Link
              href={`/series/${seriesId}/canvas`}
              className="bg-[var(--bg-secondary)] border border-[var(--color-warning)]/30 p-4 hover:border-[var(--color-warning)]/50 transition-colors group"
            >
              <div className="type-micro text-[var(--color-warning)]/60 mb-2 group-hover:text-[var(--color-warning)] transition-colors">IDEA</div>
              <h3 className="type-label text-[var(--color-warning)] mb-1">CANVAS</h3>
              <p className="type-micro text-[var(--color-warning)]/70">Brainstorm fuzzy ideas</p>
            </Link>
            <Link
              href={`/series/${seriesId}/guide`}
              className="bg-[var(--bg-secondary)] border border-[var(--accent-hover)]/30 p-4 hover:border-[var(--accent-hover)]/50 transition-colors group"
            >
              <div className="type-micro text-[var(--accent-hover)]/60 mb-2 group-hover:text-[var(--accent-hover)] transition-colors">AI</div>
              <h3 className="type-label text-[var(--accent-hover)] mb-1">GUIDE</h3>
              <p className="type-micro text-[var(--accent-hover)]/70">AI-guided writing sessions</p>
            </Link>
            <Link
              href={`/series/${seriesId}/outline`}
              className="bg-[var(--bg-secondary)] border border-[var(--accent-hover)]/30 p-4 hover:border-[var(--accent-hover)]/50 transition-colors group"
            >
              <div className="type-micro text-[var(--accent-hover)]/60 mb-2 group-hover:text-[var(--accent-hover)] transition-colors">STRUCT</div>
              <h3 className="type-label text-[var(--accent-hover)] mb-1">SERIES OUTLINE</h3>
              <p className="type-micro text-[var(--accent-hover)]/70">Timeline view // plotline tracking</p>
            </Link>
            <Link
              href={`/series/${seriesId}/weave`}
              className="bg-[var(--bg-secondary)] border border-[var(--color-error)]/30 p-4 hover:border-[var(--color-error)]/50 transition-colors group"
            >
              <div className="type-micro text-[var(--color-error)]/60 mb-2 group-hover:text-[var(--color-error)] transition-colors">WEAVE</div>
              <h3 className="type-label text-[var(--color-error)] mb-1">SERIES WEAVE</h3>
              <p className="type-micro text-[var(--color-error)]/70">Plotlines across all issues</p>
            </Link>
            <Link
              href={`/series/${seriesId}/analytics`}
              className="bg-[var(--bg-secondary)] border border-[var(--border)] p-4 hover:border-[var(--border-strong)] hover:bg-[var(--bg-tertiary)] transition-colors group"
            >
              <div className="type-micro text-[var(--text-muted)] mb-2 group-hover:text-[var(--text-primary)] transition-colors">DATA</div>
              <h3 className="type-label mb-1">ANALYTICS</h3>
              <p className="type-micro text-[var(--text-muted)]">Stats, progress, and insights</p>
            </Link>
            <Link
              href={`/series/${seriesId}/sessions`}
              className="bg-[var(--bg-secondary)] border border-[var(--border)] p-4 hover:border-[var(--border-strong)] hover:bg-[var(--bg-tertiary)] transition-colors group"
            >
              <div className="type-micro text-[var(--text-muted)] mb-2 group-hover:text-[var(--text-primary)] transition-colors">LOG</div>
              <h3 className="type-label mb-1">SESSION HISTORY</h3>
              <p className="type-micro text-[var(--text-muted)]">Track progress and loose ends</p>
            </Link>
            <Link
              href={`/series/${seriesId}/continuity`}
              className="bg-[var(--bg-secondary)] border border-[var(--border)] p-4 hover:border-[var(--border-strong)] hover:bg-[var(--bg-tertiary)] transition-colors group"
            >
              <div className="type-micro text-[var(--text-muted)] mb-2 group-hover:text-[var(--text-primary)] transition-colors">CHECK</div>
              <h3 className="type-label mb-1">CONTINUITY CHECK</h3>
              <p className="type-micro text-[var(--text-muted)]">Detect errors and inconsistencies</p>
            </Link>
            <Link
              href={`/series/${seriesId}/patterns`}
              className="bg-[var(--bg-secondary)] border border-[var(--color-primary)]/30 p-4 hover:border-[var(--color-primary)]/50 transition-colors group"
            >
              <div className="type-micro text-[var(--color-primary)]/60 mb-2 group-hover:text-[var(--color-primary)] transition-colors">CROSS</div>
              <h3 className="type-label text-[var(--color-primary)] mb-1">PATTERNS</h3>
              <p className="type-micro text-[var(--color-primary)]/70">Cross-issue weaving</p>
            </Link>
            <Link
              href={`/series/${seriesId}/notes`}
              className="bg-[var(--bg-secondary)] border border-[var(--border)] p-4 hover:border-[var(--border-strong)] hover:bg-[var(--bg-tertiary)] transition-colors group"
            >
              <div className="type-micro text-[var(--text-muted)] mb-2 group-hover:text-[var(--text-primary)] transition-colors">NOTE</div>
              <h3 className="type-label mb-1">PROJECT NOTES</h3>
              <p className="type-micro text-[var(--text-muted)]">Questions, decisions, insights</p>
            </Link>
          </div>
        </div>

        {/* World Building */}
        <div>
          <h2 className="type-section text-base mb-4">WORLD BUILDING</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 stagger-children">
            <Link
              href={`/series/${seriesId}/characters`}
              className="bg-[var(--bg-secondary)] border border-[var(--border)] p-4 hover:border-[var(--border-strong)] hover:bg-[var(--bg-tertiary)] transition-colors group"
            >
              <div className="type-micro text-[var(--text-muted)] mb-2 group-hover:text-[var(--text-primary)] transition-colors">CHAR</div>
              <h3 className="type-label mb-1">CHARACTERS</h3>
              <p className="type-micro text-[var(--text-muted)]">Manage character database</p>
            </Link>
            <Link
              href={`/series/${seriesId}/character-arcs`}
              className="bg-[var(--bg-secondary)] border border-[var(--border)] p-4 hover:border-[var(--border-strong)] hover:bg-[var(--bg-tertiary)] transition-colors group"
            >
              <div className="type-micro text-[var(--text-muted)] mb-2 group-hover:text-[var(--text-primary)] transition-colors">ARC</div>
              <h3 className="type-label mb-1">CHARACTER ARCS</h3>
              <p className="type-micro text-[var(--text-muted)]">Track emotional journeys</p>
            </Link>
            <Link
              href={`/series/${seriesId}/locations`}
              className="bg-[var(--bg-secondary)] border border-[var(--border)] p-4 hover:border-[var(--border-strong)] hover:bg-[var(--bg-tertiary)] transition-colors group"
            >
              <div className="type-micro text-[var(--text-muted)] mb-2 group-hover:text-[var(--text-primary)] transition-colors">LOC</div>
              <h3 className="type-label mb-1">LOCATIONS</h3>
              <p className="type-micro text-[var(--text-muted)]">Manage location database</p>
            </Link>
            <Link
              href={`/series/${seriesId}/plotlines`}
              className="bg-[var(--bg-secondary)] border border-[var(--border)] p-4 hover:border-[var(--border-strong)] hover:bg-[var(--bg-tertiary)] transition-colors group"
            >
              <div className="type-micro text-[var(--text-muted)] mb-2 group-hover:text-[var(--text-primary)] transition-colors">PLOT</div>
              <h3 className="type-label mb-1">PLOTLINES</h3>
              <p className="type-micro text-[var(--text-muted)]">Define narrative threads</p>
            </Link>
          </div>
        </div>
      </main>

      {/* Command Palette (Cmd+K) */}
      <CommandPalette seriesId={seriesId} />
    </div>
  )
}
