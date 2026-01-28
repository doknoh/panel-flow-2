'use client'

import Link from 'next/link'

interface Panel {
  id: string
  word_count: number | null
}

interface Page {
  id: string
  panels: Panel[]
}

interface Scene {
  pages: Page[]
}

interface Act {
  scenes: Scene[]
}

interface Issue {
  id: string
  number: number
  title: string | null
  tagline: string | null
  status: string
  updated_at: string
  acts?: Act[]
}

function getIssueStats(issue: Issue) {
  let pageCount = 0
  let panelCount = 0
  let wordCount = 0

  for (const act of issue.acts || []) {
    for (const scene of act.scenes || []) {
      for (const page of scene.pages || []) {
        pageCount++
        for (const panel of page.panels || []) {
          panelCount++
          wordCount += panel.word_count || 0
        }
      }
    }
  }

  return { pageCount, panelCount, wordCount }
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function getStatusConfig(status: string) {
  switch (status) {
    case 'complete':
      return { bg: 'bg-green-100 dark:bg-green-900/50', text: 'text-green-700 dark:text-green-300', border: 'border-green-300 dark:border-green-800' }
    case 'drafting':
      return { bg: 'bg-blue-100 dark:bg-blue-900/50', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-300 dark:border-blue-800' }
    case 'revision':
      return { bg: 'bg-yellow-100 dark:bg-yellow-900/50', text: 'text-yellow-700 dark:text-yellow-300', border: 'border-yellow-300 dark:border-yellow-800' }
    case 'outline':
      return { bg: 'bg-purple-100 dark:bg-purple-900/50', text: 'text-purple-700 dark:text-purple-300', border: 'border-purple-300 dark:border-purple-800' }
    default:
      return { bg: 'bg-[var(--bg-tertiary)]', text: 'text-[var(--text-secondary)]', border: 'border-[var(--border)]' }
  }
}

export default function IssueGrid({ issues, seriesId }: { issues: Issue[]; seriesId: string }) {
  if (issues.length === 0) {
    return (
      <div className="text-center py-12 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg">
        <div className="text-5xl mb-4 opacity-30">📚</div>
        <h3 className="text-lg font-medium text-[var(--text-primary)] mb-2">No issues yet</h3>
        <p className="text-[var(--text-muted)] text-sm max-w-md mx-auto">
          Create your first issue to start writing your graphic novel.
          Each issue can contain multiple acts, scenes, and pages.
        </p>
      </div>
    )
  }

  // Sort by issue number
  const sortedIssues = [...issues].sort((a, b) => a.number - b.number)

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {sortedIssues.map((issue) => {
        const { pageCount, panelCount, wordCount } = getIssueStats(issue)
        const statusConfig = getStatusConfig(issue.status)
        const hasContent = pageCount > 0

        return (
          <Link
            key={issue.id}
            href={`/series/${seriesId}/issues/${issue.id}`}
            className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4 hover:border-[var(--border-strong)] hover:bg-[var(--bg-tertiary)] transition-all group"
          >
            <div className="flex items-start justify-between mb-2">
              <span className="text-2xl font-bold text-[var(--text-primary)] group-hover:text-[var(--color-primary)] transition-colors">
                #{issue.number}
              </span>
              <span className={`text-xs px-2 py-1 rounded border ${statusConfig.bg} ${statusConfig.text} ${statusConfig.border}`}>
                {issue.status}
              </span>
            </div>

            {issue.title && (
              <h3 className="font-medium mb-1 text-[var(--text-primary)] line-clamp-1">{issue.title}</h3>
            )}
            {issue.tagline && (
              <p className="text-[var(--text-muted)] text-sm line-clamp-2 mb-3">{issue.tagline}</p>
            )}

            {/* Stats Row */}
            {hasContent ? (
              <div className="flex items-center gap-3 text-xs text-[var(--text-muted)] mt-auto pt-2 border-t border-[var(--border)]">
                <span title="Pages" className="flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  {pageCount}
                </span>
                <span title="Panels" className="flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
                  </svg>
                  {panelCount}
                </span>
                {wordCount > 0 && (
                  <span title="Words" className="flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                    </svg>
                    {wordCount.toLocaleString()}
                  </span>
                )}
              </div>
            ) : (
              <div className="text-xs text-[var(--text-muted)] mt-auto pt-2 border-t border-[var(--border)] italic">
                No content yet
              </div>
            )}

            {/* Last edited */}
            <div className="text-xs text-[var(--text-muted)] mt-2">
              Updated {formatRelativeTime(issue.updated_at)}
            </div>
          </Link>
        )
      })}
    </div>
  )
}
