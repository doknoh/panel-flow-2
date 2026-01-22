'use client'

import Link from 'next/link'

interface Issue {
  id: string
  number: number
  title: string | null
  tagline: string | null
  status: string
  updated_at: string
}

export default function IssueGrid({ issues, seriesId }: { issues: Issue[]; seriesId: string }) {
  if (issues.length === 0) {
    return (
      <div className="text-center py-12 bg-zinc-900 border border-zinc-800 rounded-lg">
        <p className="text-zinc-400">No issues yet. Create your first issue to start writing!</p>
      </div>
    )
  }

  // Sort by issue number
  const sortedIssues = [...issues].sort((a, b) => a.number - b.number)

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {sortedIssues.map((issue) => (
        <Link
          key={issue.id}
          href={`/series/${seriesId}/issues/${issue.id}`}
          className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 hover:border-zinc-700 transition-colors"
        >
          <div className="flex items-start justify-between mb-2">
            <span className="text-2xl font-bold">#{issue.number}</span>
            <span className={`text-xs px-2 py-1 rounded ${
              issue.status === 'complete' ? 'bg-green-900 text-green-300' :
              issue.status === 'drafting' ? 'bg-blue-900 text-blue-300' :
              issue.status === 'revision' ? 'bg-yellow-900 text-yellow-300' :
              'bg-zinc-800 text-zinc-400'
            }`}>
              {issue.status}
            </span>
          </div>
          {issue.title && (
            <h3 className="font-medium mb-1 line-clamp-1">{issue.title}</h3>
          )}
          {issue.tagline && (
            <p className="text-zinc-500 text-sm line-clamp-2">{issue.tagline}</p>
          )}
        </Link>
      ))}
    </div>
  )
}
