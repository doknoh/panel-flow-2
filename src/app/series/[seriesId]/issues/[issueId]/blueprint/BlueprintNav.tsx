'use client'

import Link from 'next/link'
import { Tip } from '@/components/ui/Tip'

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
        <Tip content="Back to Editor">
          <Link
            href={`/series/${seriesId}/issues/${issueId}`}
            className="bp-nav-brand-icon hover-glow"
            style={{ textDecoration: 'none', color: 'inherit' }}
          >
            P
          </Link>
        </Tip>
        <span>Panel_Flow</span>
        <span style={{ fontWeight: 400, fontSize: '0.75rem', opacity: 0.6, letterSpacing: 0 }}>
          #{String(issueNumber).padStart(2, '0')} {issueTitle || 'Untitled'}
        </span>
      </div>

      <div className="bp-nav-tools">
        <Tip content="Open page editor">
          <Link
            href={`/series/${seriesId}/issues/${issueId}`}
            className="bp-tool-btn hover-glow"
            style={{ textDecoration: 'none' }}
          >
            Editor
          </Link>
        </Tip>
        <Tip content="Blueprint script view (current)">
          <button className="bp-tool-btn active">Script</button>
        </Tip>
        <Tip content="Import script from text">
          <Link
            href={`/series/${seriesId}/issues/${issueId}/import`}
            className="bp-tool-btn hover-glow"
            style={{ textDecoration: 'none' }}
          >
            Import
          </Link>
        </Tip>
        <Tip content="View version history">
          <Link
            href={`/series/${seriesId}/issues/${issueId}/history`}
            className="bp-tool-btn hover-glow"
            style={{ textDecoration: 'none' }}
          >
            History
          </Link>
        </Tip>
      </div>

      <div style={{ fontFamily: 'var(--bp-mono)', fontSize: '0.625rem' }}>
        VER 2.0
      </div>
    </nav>
  )
}
