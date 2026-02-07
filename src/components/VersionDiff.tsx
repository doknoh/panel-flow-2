'use client'

import { useState } from 'react'
import {
  DiffResult,
  PageDiff,
  getDiffStatusColor,
  getDiffBgColor,
  generateDiffSummary
} from '@/lib/version-diff'

interface VersionDiffProps {
  pageDiffs: PageDiff[]
  showUnchanged?: boolean
  compact?: boolean
}

export default function VersionDiff({
  pageDiffs,
  showUnchanged = false,
  compact = false
}: VersionDiffProps) {
  const [expandedPages, setExpandedPages] = useState<Set<number>>(new Set())
  const [showAllUnchanged, setShowAllUnchanged] = useState(showUnchanged)

  const togglePage = (pageNum: number) => {
    const newExpanded = new Set(expandedPages)
    if (newExpanded.has(pageNum)) {
      newExpanded.delete(pageNum)
    } else {
      newExpanded.add(pageNum)
    }
    setExpandedPages(newExpanded)
  }

  const filteredDiffs = showAllUnchanged
    ? pageDiffs
    : pageDiffs.filter(p => p.status !== 'unchanged')

  const summary = generateDiffSummary(pageDiffs)

  return (
    <div className="space-y-4">
      {/* Summary header */}
      <div className="flex items-center justify-between px-4 py-3 bg-[var(--bg-secondary)] rounded-lg">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium">Changes Summary:</span>
          <span className="text-sm text-[var(--text-secondary)]">{summary}</span>
        </div>

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showAllUnchanged}
              onChange={(e) => setShowAllUnchanged(e.target.checked)}
              className="rounded border-[var(--border)] bg-[var(--bg-tertiary)]"
            />
            Show unchanged
          </label>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6 px-4 text-xs">
        <span className="flex items-center gap-2">
          <span className="w-3 h-3 rounded bg-green-500/30 border border-green-500" />
          <span className="text-green-400">Added</span>
        </span>
        <span className="flex items-center gap-2">
          <span className="w-3 h-3 rounded bg-amber-500/30 border border-amber-500" />
          <span className="text-amber-400">Modified</span>
        </span>
        <span className="flex items-center gap-2">
          <span className="w-3 h-3 rounded bg-red-500/30 border border-red-500" />
          <span className="text-red-400">Removed</span>
        </span>
        <span className="flex items-center gap-2">
          <span className="w-3 h-3 rounded bg-[var(--bg-tertiary)] border border-[var(--border)]" />
          <span className="text-[var(--text-secondary)]">Unchanged</span>
        </span>
      </div>

      {/* Page diffs */}
      <div className="space-y-2">
        {filteredDiffs.length === 0 ? (
          <div className="text-center py-8 text-[var(--text-secondary)]">
            No changes detected
          </div>
        ) : (
          filteredDiffs.map((pageDiff) => (
            <PageDiffCard
              key={pageDiff.pageNumber}
              pageDiff={pageDiff}
              expanded={expandedPages.has(pageDiff.pageNumber)}
              onToggle={() => togglePage(pageDiff.pageNumber)}
              compact={compact}
            />
          ))
        )}
      </div>
    </div>
  )
}

interface PageDiffCardProps {
  pageDiff: PageDiff
  expanded: boolean
  onToggle: () => void
  compact: boolean
}

function PageDiffCard({ pageDiff, expanded, onToggle, compact }: PageDiffCardProps) {
  const statusColors = {
    new: 'border-green-500/50 bg-green-500/5',
    modified: 'border-amber-500/50 bg-amber-500/5',
    removed: 'border-red-500/50 bg-red-500/5',
    unchanged: 'border-[var(--border)] bg-[var(--bg-secondary)]'
  }

  const statusIcons = {
    new: '+',
    modified: '~',
    removed: '-',
    unchanged: '='
  }

  return (
    <div className={`border rounded-lg overflow-hidden ${statusColors[pageDiff.status]}`}>
      {/* Page header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-[var(--bg-tertiary)]/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className={`font-mono text-lg ${getDiffStatusColor(pageDiff.status)}`}>
            {statusIcons[pageDiff.status]}
          </span>
          <span className="font-medium">Page {pageDiff.pageNumber}</span>
          <span className="text-sm text-[var(--text-secondary)]">
            {pageDiff.status === 'new' && `${pageDiff.newPanelCount} panels`}
            {pageDiff.status === 'removed' && `${pageDiff.oldPanelCount} panels removed`}
            {pageDiff.status === 'modified' && (
              pageDiff.oldPanelCount !== pageDiff.newPanelCount
                ? `${pageDiff.oldPanelCount} → ${pageDiff.newPanelCount} panels`
                : `${pageDiff.newPanelCount} panels`
            )}
            {pageDiff.status === 'unchanged' && `${pageDiff.newPanelCount} panels`}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {pageDiff.panels.filter(p => p.status !== 'unchanged').length > 0 && (
            <span className="text-xs text-[var(--text-secondary)]">
              {pageDiff.panels.filter(p => p.status !== 'unchanged').length} panel changes
            </span>
          )}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>

      {/* Panel details */}
      {expanded && (
        <div className="border-t border-[var(--border)] px-4 py-3 space-y-3">
          {pageDiff.panels.map((panelDiff) => (
            <div
              key={panelDiff.panelNumber}
              className={`flex items-start gap-3 p-2 rounded ${
                panelDiff.status === 'unchanged' ? '' : getDiffBgColor(
                  panelDiff.status === 'new' ? 'added' :
                  panelDiff.status === 'removed' ? 'removed' : 'modified'
                )
              }`}
            >
              <span className={`font-mono text-sm ${getDiffStatusColor(panelDiff.status)}`}>
                {statusIcons[panelDiff.status]}
              </span>
              <div className="flex-1">
                <span className="text-sm font-medium">Panel {panelDiff.panelNumber}</span>
                {panelDiff.visualDiff && (
                  <div className="mt-2">
                    <LineDiff diffResult={panelDiff.visualDiff} compact={compact} />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface LineDiffProps {
  diffResult: DiffResult
  compact: boolean
}

function LineDiff({ diffResult, compact }: LineDiffProps) {
  if (compact) {
    return (
      <div className="text-xs text-[var(--text-secondary)]">
        {diffResult.stats.added > 0 && (
          <span className="text-green-400 mr-2">+{diffResult.stats.added}</span>
        )}
        {diffResult.stats.removed > 0 && (
          <span className="text-red-400 mr-2">-{diffResult.stats.removed}</span>
        )}
        {diffResult.stats.modified > 0 && (
          <span className="text-amber-400">~{diffResult.stats.modified}</span>
        )}
      </div>
    )
  }

  return (
    <div className="font-mono text-xs space-y-1 max-h-48 overflow-auto">
      {diffResult.lines.map((line, idx) => (
        <div
          key={idx}
          className={`px-2 py-0.5 rounded ${getDiffBgColor(line.type)}`}
        >
          <span className={`mr-2 ${getDiffStatusColor(
            line.type === 'added' ? 'new' :
            line.type === 'removed' ? 'removed' :
            line.type === 'modified' ? 'modified' : 'unchanged'
          )}`}>
            {line.type === 'added' ? '+' :
             line.type === 'removed' ? '-' :
             line.type === 'modified' ? '~' : ' '}
          </span>
          <span className={line.type === 'removed' ? 'line-through opacity-70' : ''}>
            {line.content || ' '}
          </span>
          {line.type === 'modified' && line.oldContent && (
            <span className="block ml-4 text-red-400 line-through opacity-70">
              {line.oldContent}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

/**
 * Side-by-side diff view for larger comparisons
 */
interface SideBySideDiffProps {
  oldContent: string
  newContent: string
  oldTitle?: string
  newTitle?: string
}

export function SideBySideDiff({
  oldContent,
  newContent,
  oldTitle = 'Original',
  newTitle = 'New'
}: SideBySideDiffProps) {
  const oldLines = oldContent.split('\n')
  const newLines = newContent.split('\n')

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Old content */}
      <div className="border border-[var(--border)] rounded-lg overflow-hidden">
        <div className="px-4 py-2 bg-red-500/10 border-b border-[var(--border)]">
          <span className="text-sm font-medium text-red-400">{oldTitle}</span>
        </div>
        <div className="p-4 font-mono text-xs max-h-96 overflow-auto">
          {oldLines.map((line, idx) => (
            <div key={idx} className="flex">
              <span className="w-8 text-[var(--text-muted)] select-none">{idx + 1}</span>
              <span className="flex-1">{line || ' '}</span>
            </div>
          ))}
        </div>
      </div>

      {/* New content */}
      <div className="border border-[var(--border)] rounded-lg overflow-hidden">
        <div className="px-4 py-2 bg-green-500/10 border-b border-[var(--border)]">
          <span className="text-sm font-medium text-green-400">{newTitle}</span>
        </div>
        <div className="p-4 font-mono text-xs max-h-96 overflow-auto">
          {newLines.map((line, idx) => (
            <div key={idx} className="flex">
              <span className="w-8 text-[var(--text-muted)] select-none">{idx + 1}</span>
              <span className="flex-1">{line || ' '}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
