import Link from 'next/link'
import FontScaleToggle from '@/components/ui/FontScaleToggle'

interface WeaveHeaderProps {
  issueNumber: number
  pageCount: number
  spreadCount: number
  showPlotlineManager: boolean
  onTogglePlotlineManager: () => void
  seriesId: string
  issueId: string
}

export function WeaveHeader({
  issueNumber,
  pageCount,
  spreadCount,
  showPlotlineManager,
  onTogglePlotlineManager,
  seriesId,
  issueId,
}: WeaveHeaderProps) {
  return (
    <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)]">
      <div className="flex items-center gap-2">
        <Link
          href={`/series/${seriesId}/issues/${issueId}`}
          className="text-[var(--text-muted)] hover:opacity-80"
          style={{ fontFamily: "'Helvetica Neue', Helvetica, sans-serif", fontSize: '0.6875rem', fontWeight: 800 }}
        >
          ← ISSUE #{issueNumber}
        </Link>
        <span className="text-[var(--text-disabled)]">{'//'}</span>
        <span
          className="text-[var(--text-primary)]"
          style={{ fontFamily: "'Helvetica Neue', Helvetica, sans-serif", fontSize: '1.125rem', fontWeight: 900 }}
        >
          THE WEAVE
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="font-mono text-[0.625rem] text-[var(--text-muted)]">
          {pageCount} PAGES · {spreadCount} SPREADS
        </span>
        <FontScaleToggle />
        <span className="text-[var(--text-disabled)]">|</span>
        <button
          onClick={onTogglePlotlineManager}
          className="text-[var(--color-primary)] cursor-pointer hover:opacity-80"
          style={{ fontFamily: "'Helvetica Neue', Helvetica, sans-serif", fontSize: '0.625rem', fontWeight: 700 }}
        >
          MANAGE PLOTLINES
        </button>
      </div>
    </div>
  )
}
