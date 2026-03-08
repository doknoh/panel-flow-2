'use client'

import Link from 'next/link'

interface BlueprintNavProps {
  seriesId: string
  issueId: string
  issueTitle: string | null
  issueNumber: number
}

export default function BlueprintNav({ seriesId, issueId, issueTitle, issueNumber }: BlueprintNavProps) {
  return (
    <nav className="bp-nav">
      <div className="bp-nav-brand">
        <Link
          href={`/series/${seriesId}/issues/${issueId}`}
          className="bp-nav-brand-icon"
          title="Back to Editor"
          style={{ textDecoration: 'none', color: 'inherit' }}
        >
          P
        </Link>
        <span>Panel_Flow</span>
        <span style={{ fontWeight: 400, fontSize: '0.75rem', opacity: 0.6, letterSpacing: 0 }}>
          #{String(issueNumber).padStart(2, '0')} {issueTitle || 'Untitled'}
        </span>
      </div>

      <div className="bp-nav-tools">
        <Link
          href={`/series/${seriesId}/issues/${issueId}`}
          className="bp-tool-btn"
          style={{ textDecoration: 'none' }}
        >
          Editor
        </Link>
        <button className="bp-tool-btn active">Script</button>
        <Link
          href={`/series/${seriesId}/issues/${issueId}/import`}
          className="bp-tool-btn"
          style={{ textDecoration: 'none' }}
        >
          Import
        </Link>
        <Link
          href={`/series/${seriesId}/issues/${issueId}/history`}
          className="bp-tool-btn"
          style={{ textDecoration: 'none' }}
        >
          History
        </Link>
      </div>

      <div style={{ fontFamily: 'var(--bp-mono)', fontSize: '10px' }}>
        VER 2.0
      </div>
    </nav>
  )
}
