'use client'

import Link from 'next/link'

interface EnrichmentChecklistProps {
  seriesId: string
  issueId: string
  stats: {
    charactersLinked: number
    charactersTotal: number
    charactersNeedAttention: number
    plotlinesAssigned: number
    plotlinesTotal: number
    descriptionsCapitalized: boolean
    storyBeatsPopulated: number
    storyBeatsTotal: number
  }
  onDismiss: () => void
  onSuggestBeats: () => void
}

export default function EnrichmentChecklist({
  seriesId, issueId, stats, onDismiss, onSuggestBeats,
}: EnrichmentChecklistProps) {
  return (
    <div className="max-w-lg mx-auto p-6">
      <h2 className="type-section mb-2">Import Complete</h2>
      <p className="text-sm text-[var(--text-secondary)] mb-6">
        Your script has been imported. Here&apos;s what might need attention:
      </p>

      <div className="space-y-3 mb-6">
        <ChecklistItem
          label={`Characters linked: ${stats.charactersLinked}/${stats.charactersTotal}`}
          status={stats.charactersNeedAttention === 0 ? 'done' : 'attention'}
          detail={stats.charactersNeedAttention > 0 ? `${stats.charactersNeedAttention} need attention` : undefined}
          href={`/series/${seriesId}/characters`}
        />

        <ChecklistItem
          label={`Plotlines assigned: ${stats.plotlinesAssigned}/${stats.plotlinesTotal} scenes`}
          status={stats.plotlinesAssigned === stats.plotlinesTotal ? 'done' : 'todo'}
          href={`/series/${seriesId}/issues/${issueId}/weave`}
        />

        <ChecklistItem
          label="Visual descriptions capitalized"
          status={stats.descriptionsCapitalized ? 'done' : 'todo'}
        />

        <ChecklistItem
          label={`Story beats: ${stats.storyBeatsPopulated}/${stats.storyBeatsTotal} pages`}
          status={stats.storyBeatsPopulated === stats.storyBeatsTotal ? 'done' : 'todo'}
          action={stats.storyBeatsPopulated < stats.storyBeatsTotal ? {
            label: 'Suggest beats from script',
            onClick: onSuggestBeats,
          } : undefined}
        />
      </div>

      <button
        onClick={onDismiss}
        className="hover-lift type-micro px-4 py-2 border border-[var(--border)] text-[var(--text-secondary)]"
      >
        Go to Editor →
      </button>
    </div>
  )
}

function ChecklistItem({ label, status, detail, href, action }: {
  label: string
  status: 'done' | 'attention' | 'todo'
  detail?: string
  href?: string
  action?: { label: string; onClick: () => void }
}) {
  const statusIcon = status === 'done' ? '✓' : status === 'attention' ? '!' : '○'
  const statusColor = status === 'done' ? 'text-[var(--color-success)]' :
    status === 'attention' ? 'text-[var(--color-warning)]' : 'text-[var(--text-muted)]'

  return (
    <div className="flex items-center gap-3 p-3 bg-[var(--bg-secondary)] rounded border border-[var(--border)]">
      <span className={`${statusColor} font-bold`}>{statusIcon}</span>
      <div className="flex-1">
        <span className="text-sm">{label}</span>
        {detail && <span className="text-xs text-[var(--color-warning)] ml-2">{detail}</span>}
      </div>
      {href && (
        <Link href={href} className="text-xs text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]">
          Fix →
        </Link>
      )}
      {action && (
        <button onClick={action.onClick} className="text-xs text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]">
          {action.label}
        </button>
      )}
    </div>
  )
}
