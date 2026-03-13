'use client'

import { useMemo, useState } from 'react'
import { checkDescription, DescriptionIssue } from '@/lib/analysis/description-checker'

interface DescriptionAnalysisProps {
  visualDescription: string
  shotType?: string | null
}

const SEVERITY_STYLES: Record<DescriptionIssue['severity'], { bg: string; text: string; border: string }> = {
  warning: {
    bg: 'bg-[var(--color-warning)]/10',
    text: 'text-[var(--color-warning)]',
    border: 'border-[var(--color-warning)]/30',
  },
  info: {
    bg: 'bg-[var(--color-info)]/10',
    text: 'text-[var(--color-info)]',
    border: 'border-[var(--color-info)]/30',
  },
}

const TYPE_LABELS: Record<DescriptionIssue['type'], string> = {
  passive_voice: 'Passive voice',
  vague_description: 'Vague',
  too_long: 'Long',
  repeated_words: 'Repetition',
  missing_shot_type: 'No shot type',
}

export default function DescriptionAnalysis({ visualDescription, shotType }: DescriptionAnalysisProps) {
  const [expanded, setExpanded] = useState(false)

  const issues = useMemo(
    () => checkDescription(visualDescription, shotType),
    [visualDescription, shotType]
  )

  if (issues.length === 0) return null

  const warningCount = issues.filter(i => i.severity === 'warning').length
  const infoCount = issues.length - warningCount

  return (
    <div className="mt-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border active:scale-[0.97] transition-all duration-150 ease-out bg-[var(--bg-tertiary)] border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover-fade"
      >
        {warningCount > 0 && (
          <span className="text-[var(--color-warning)]">{warningCount} warning{warningCount !== 1 ? 's' : ''}</span>
        )}
        {warningCount > 0 && infoCount > 0 && <span className="text-[var(--text-muted)]">/</span>}
        {infoCount > 0 && (
          <span className="text-[var(--color-info)]">{infoCount} tip{infoCount !== 1 ? 's' : ''}</span>
        )}
        <span className="text-[var(--text-muted)]">{expanded ? '▴' : '▾'}</span>
      </button>

      {expanded && (
        <div className="mt-2 space-y-1.5">
          {issues.map((issue, i) => {
            const style = SEVERITY_STYLES[issue.severity]
            return (
              <div
                key={i}
                className={`text-xs px-2.5 py-1.5 rounded border ${style.bg} ${style.border}`}
              >
                <span className={`font-medium ${style.text}`}>
                  {TYPE_LABELS[issue.type]}:
                </span>{' '}
                <span className="text-[var(--text-secondary)]">{issue.message}</span>
                {issue.suggestion && (
                  <div className="mt-0.5 text-[var(--text-muted)] italic">{issue.suggestion}</div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
