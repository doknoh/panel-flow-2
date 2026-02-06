'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import {
  analyzeIssueRhythm,
  getDensityColor,
  getTempoLabel,
  getTempoColor,
  formatRatio,
  PageRhythm,
} from '@/lib/visual-rhythm'

interface RhythmClientProps {
  seriesId: string
  seriesTitle: string
  issueId: string
  issueNumber: number
  issueTitle: string | null
  acts: any[]
}

export default function RhythmClient({
  seriesId,
  seriesTitle,
  issueId,
  issueNumber,
  issueTitle,
  acts,
}: RhythmClientProps) {
  // Analyze issue rhythm
  const rhythm = useMemo(() => {
    return analyzeIssueRhythm(acts)
  }, [acts])

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      {/* Header */}
      <header className="border-b border-[var(--border)] bg-[var(--bg-secondary)]">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3 text-sm text-[var(--text-muted)] mb-2">
            <Link href={`/series/${seriesId}`} className="hover:text-[var(--text-primary)]">
              {seriesTitle}
            </Link>
            <span>/</span>
            <Link href={`/series/${seriesId}/issues/${issueId}`} className="hover:text-[var(--text-primary)]">
              Issue #{issueNumber}
            </Link>
            <span>/</span>
            <span className="text-[var(--text-primary)]">Visual Rhythm</span>
          </div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            🎵 Visual Rhythm
          </h1>
          {issueTitle && (
            <p className="text-[var(--text-muted)] mt-1">{issueTitle}</p>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* Overall Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
            <div className={`text-2xl font-bold ${getTempoColor(rhythm.overallTempo)}`}>
              {getTempoLabel(rhythm.overallTempo)}
            </div>
            <div className="text-[var(--text-muted)] text-sm">Overall Tempo</div>
          </div>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
            <div className="text-2xl font-bold">{rhythm.avgPanelsPerPage}</div>
            <div className="text-[var(--text-muted)] text-sm">Avg Panels/Page</div>
          </div>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
            <div className="text-2xl font-bold text-blue-400">{formatRatio(rhythm.silentRatio)}</div>
            <div className="text-[var(--text-muted)] text-sm">Silent Panels</div>
          </div>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
            <div className="text-2xl font-bold text-green-400">{formatRatio(rhythm.dialogueRatio)}</div>
            <div className="text-[var(--text-muted)] text-sm">Dialogue Panels</div>
          </div>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
            <div className="text-2xl font-bold text-red-400">{formatRatio(rhythm.actionRatio)}</div>
            <div className="text-[var(--text-muted)] text-sm">Action Panels</div>
          </div>
        </div>

        {/* Page-by-Page Rhythm Visualization */}
        <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4 mb-8">
          <h2 className="font-semibold mb-4">Page-by-Page Rhythm</h2>

          {rhythm.pages.length > 0 ? (
            <>
              {/* Visual bar chart */}
              <div className="flex items-end gap-1 h-32 mb-4 overflow-x-auto pb-2">
                {rhythm.pages.map((page) => (
                  <div
                    key={page.pageId}
                    className="flex flex-col items-center min-w-[24px]"
                  >
                    <div
                      className={`w-5 rounded-t transition-all ${getDensityColor(page.density)}`}
                      style={{ height: `${Math.max(8, (page.panelCount / 10) * 100)}%` }}
                      title={`Page ${page.pageNumber}: ${page.panelCount} panels, ${page.wordCount} words`}
                    />
                    <span className="text-xs text-[var(--text-muted)] mt-1">{page.pageNumber}</span>
                  </div>
                ))}
              </div>

              {/* Legend */}
              <div className="flex gap-4 text-xs text-[var(--text-muted)]">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-blue-400 rounded"></div>
                  <span>Sparse (≤3 panels)</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-blue-600 rounded"></div>
                  <span>Normal (4-6 panels)</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-blue-800 rounded"></div>
                  <span>Dense (≥7 panels)</span>
                </div>
              </div>
            </>
          ) : (
            <p className="text-[var(--text-muted)] text-center py-8">No pages to analyze</p>
          )}
        </div>

        {/* Two-column layout */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Silent Sequences */}
          <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
            <h2 className="font-semibold mb-4 flex items-center gap-2">
              <span>🤫</span>
              Silent Sequences
            </h2>
            {rhythm.silentSequences.length > 0 ? (
              <div className="space-y-3">
                {rhythm.silentSequences.map((seq, i) => (
                  <div key={i} className="bg-[var(--bg-primary)] rounded p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium">
                        Pages {seq.startPage}–{seq.endPage}
                      </span>
                      <span className="text-sm text-[var(--text-muted)]">
                        {seq.length} pages
                      </span>
                    </div>
                    <div className="text-sm text-[var(--text-muted)]">
                      {seq.length <= 2 && '✅ Good breathing room'}
                      {seq.length > 2 && seq.length <= 4 && '✅ Extended visual sequence'}
                      {seq.length > 4 && '⚠️ Long silent stretch—ensure clarity'}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[var(--text-muted)] text-sm">
                No significant silent sequences detected.
                {rhythm.pages.length > 10 && ' Consider adding visual breathing room.'}
              </p>
            )}
          </div>

          {/* Insights */}
          <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
            <h2 className="font-semibold mb-4 flex items-center gap-2">
              <span>💡</span>
              Rhythm Insights
            </h2>
            {rhythm.insights.length > 0 ? (
              <div className="space-y-3">
                {rhythm.insights.map((insight, i) => (
                  <div
                    key={i}
                    className={`p-3 rounded ${
                      insight.type === 'warning'
                        ? 'bg-yellow-500/10 border border-yellow-500/30'
                        : insight.type === 'strength'
                        ? 'bg-green-500/10 border border-green-500/30'
                        : 'bg-blue-500/10 border border-blue-500/30'
                    }`}
                  >
                    <div className={`flex items-start gap-2 ${
                      insight.type === 'warning'
                        ? 'text-yellow-300'
                        : insight.type === 'strength'
                        ? 'text-green-300'
                        : 'text-blue-300'
                    }`}>
                      <span className="shrink-0">
                        {insight.type === 'warning' ? '⚠️' : insight.type === 'strength' ? '✅' : '💡'}
                      </span>
                      <div>
                        <div>{insight.message}</div>
                        {insight.pages && insight.pages.length > 0 && (
                          <div className="text-xs mt-1 opacity-70">
                            Pages: {insight.pages.join(', ')}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[var(--text-muted)] text-sm">
                No specific insights for this issue.
              </p>
            )}
          </div>
        </div>

        {/* Page Details Table */}
        <div className="mt-8 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg overflow-hidden">
          <h2 className="font-semibold p-4 border-b border-[var(--border)]">Page Details</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--bg-tertiary)]">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Page</th>
                  <th className="text-left px-4 py-2 font-medium">Type</th>
                  <th className="text-left px-4 py-2 font-medium">Panels</th>
                  <th className="text-left px-4 py-2 font-medium">Words</th>
                  <th className="text-left px-4 py-2 font-medium">Silent</th>
                  <th className="text-left px-4 py-2 font-medium">Dialogue</th>
                  <th className="text-left px-4 py-2 font-medium">Action</th>
                  <th className="text-left px-4 py-2 font-medium">Density</th>
                </tr>
              </thead>
              <tbody>
                {rhythm.pages.map((page) => (
                  <tr key={page.pageId} className="border-t border-[var(--border)]">
                    <td className="px-4 py-2">
                      <span className="font-medium">{page.pageNumber}</span>
                      <span className="text-[var(--text-muted)] ml-1">
                        ({page.isLeftPage ? 'L' : 'R'})
                      </span>
                    </td>
                    <td className="px-4 py-2 text-[var(--text-muted)]">
                      {page.isSplash && <span className="text-purple-400">Splash</span>}
                      {page.isSpread && <span className="text-cyan-400">Spread</span>}
                      {!page.isSplash && !page.isSpread && 'Standard'}
                    </td>
                    <td className="px-4 py-2">{page.panelCount}</td>
                    <td className="px-4 py-2">{page.wordCount}</td>
                    <td className="px-4 py-2">{page.silentPanels}</td>
                    <td className="px-4 py-2">{page.dialoguePanels}</td>
                    <td className="px-4 py-2">{page.actionPanels}</td>
                    <td className="px-4 py-2">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs ${
                        page.density === 'sparse' ? 'bg-blue-400/20 text-blue-300' :
                        page.density === 'normal' ? 'bg-blue-600/20 text-blue-300' :
                        'bg-blue-800/20 text-blue-300'
                      }`}>
                        {page.density}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  )
}
