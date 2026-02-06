'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  analyzeSeriesPatterns,
  Series,
  PlotlineThread,
  CharacterTrajectory,
  ConvergencePoint,
  PatternInsight,
  getAppearanceIntensity,
  getIntensityColor,
  getInsightColor,
  getInsightIcon,
  formatIssueRange,
} from '@/lib/series-patterns'

interface PatternsClientProps {
  seriesId: string
  seriesTitle: string
  seriesData: Series
}

type ViewMode = 'plotlines' | 'characters'

export default function PatternsClient({
  seriesId,
  seriesTitle,
  seriesData,
}: PatternsClientProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('plotlines')

  // Analyze patterns
  const patterns = useMemo(() => {
    return analyzeSeriesPatterns(seriesData)
  }, [seriesData])

  const issueNumbers = useMemo(() => {
    return (seriesData.issues || []).map(i => i.number).sort((a, b) => a - b)
  }, [seriesData])

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      {/* Header */}
      <header className="border-b border-[var(--border)] bg-[var(--bg-secondary)]">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3 text-sm text-[var(--text-muted)] mb-2">
            <Link href={`/series/${seriesId}`} className="hover:text-[var(--text-primary)]">
              {seriesTitle}
            </Link>
            <span>/</span>
            <span className="text-[var(--text-primary)]">Patterns</span>
          </div>
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              🕸️ Cross-Issue Patterns
            </h1>
            <div className="flex gap-2">
              <button
                onClick={() => setViewMode('plotlines')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  viewMode === 'plotlines'
                    ? 'bg-blue-600 text-white'
                    : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Plotlines
              </button>
              <button
                onClick={() => setViewMode('characters')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  viewMode === 'characters'
                    ? 'bg-blue-600 text-white'
                    : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Characters
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Plotlines View */}
        {viewMode === 'plotlines' && (
          <div className="space-y-8">
            {/* Plotline Weaving Visualization */}
            <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
              <h2 className="font-semibold mb-4">Plotline Weaving</h2>

              {patterns.plotlineThreads.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <th className="text-left px-2 py-1 font-medium text-[var(--text-muted)] w-40">Plotline</th>
                        {issueNumbers.map(num => (
                          <th key={num} className="text-center px-2 py-1 font-medium text-[var(--text-muted)] min-w-[40px]">
                            #{num}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {patterns.plotlineThreads.map((thread) => (
                        <tr key={thread.plotlineId} className="border-t border-[var(--border)]">
                          <td className="px-2 py-2">
                            <div className="flex items-center gap-2">
                              <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: thread.color || '#666' }}
                              />
                              <span className="truncate">{thread.plotlineName}</span>
                            </div>
                          </td>
                          {issueNumbers.map(num => {
                            const appearance = thread.appearances.find(a => a.issueNumber === num)
                            return (
                              <td key={num} className="text-center px-2 py-2">
                                {appearance ? (
                                  <div className="flex items-center justify-center">
                                    {appearance.isFirstAppearance && (
                                      <span className="text-green-400" title="First Appearance">●</span>
                                    )}
                                    {!appearance.isFirstAppearance && !appearance.isClimaxIssue && !appearance.isResolutionIssue && (
                                      <span className="text-blue-400">─</span>
                                    )}
                                    {appearance.isClimaxIssue && (
                                      <span className="text-yellow-400" title="Climax">*</span>
                                    )}
                                    {appearance.isResolutionIssue && (
                                      <span className="text-purple-400" title="Resolution">R</span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-[var(--text-muted)] opacity-30">·</span>
                                )}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Legend */}
                  <div className="flex gap-4 mt-4 text-xs text-[var(--text-muted)]">
                    <div className="flex items-center gap-1">
                      <span className="text-green-400">●</span>
                      <span>First Appearance</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-blue-400">─</span>
                      <span>Present</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-yellow-400">*</span>
                      <span>Climax</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-purple-400">R</span>
                      <span>Resolution</span>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-[var(--text-muted)] text-center py-8">
                  No plotlines defined. Add plotlines in the Series settings.
                </p>
              )}
            </div>

            {/* Convergence Points */}
            {patterns.convergencePoints.length > 0 && (
              <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
                <h2 className="font-semibold mb-4 flex items-center gap-2">
                  <span>🎯</span>
                  Convergence Points
                </h2>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {patterns.convergencePoints.map((cp) => (
                    <div
                      key={cp.issueId}
                      className="bg-[var(--bg-primary)] rounded-lg p-3"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium">Issue #{cp.issueNumber}</span>
                        <span className="text-sm text-[var(--text-muted)]">
                          {cp.plotlineCount} plotlines
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {cp.plotlines.map((name, i) => (
                          <span
                            key={i}
                            className="text-xs px-2 py-0.5 bg-[var(--bg-tertiary)] rounded"
                          >
                            {name}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Characters View */}
        {viewMode === 'characters' && (
          <div className="space-y-8">
            {/* Character Appearance Grid */}
            <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
              <h2 className="font-semibold mb-4">Character Appearances</h2>

              {patterns.characterTrajectories.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <th className="text-left px-2 py-1 font-medium text-[var(--text-muted)] w-40">Character</th>
                        {issueNumbers.map(num => (
                          <th key={num} className="text-center px-2 py-1 font-medium text-[var(--text-muted)] min-w-[40px]">
                            #{num}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {patterns.characterTrajectories.map((trajectory) => (
                        <tr key={trajectory.characterId} className="border-t border-[var(--border)]">
                          <td className="px-2 py-2">
                            <div className="flex items-center gap-2">
                              <span className="truncate">{trajectory.characterName}</span>
                              {trajectory.role === 'protagonist' && (
                                <span className="text-xs px-1.5 py-0.5 bg-blue-900 text-blue-300 rounded">P</span>
                              )}
                              {trajectory.role === 'antagonist' && (
                                <span className="text-xs px-1.5 py-0.5 bg-red-900 text-red-300 rounded">A</span>
                              )}
                            </div>
                          </td>
                          {issueNumbers.map(num => {
                            const appearance = trajectory.appearances.find(a => a.issueNumber === num)
                            const intensity = appearance ? getAppearanceIntensity(appearance) : 0
                            return (
                              <td key={num} className="text-center px-2 py-2">
                                <div
                                  className={`w-6 h-6 mx-auto rounded ${getIntensityColor(intensity)}`}
                                  title={appearance ? `${appearance.totalAppearances} appearances` : 'Not present'}
                                />
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Legend */}
                  <div className="flex gap-4 mt-4 text-xs text-[var(--text-muted)]">
                    <div className="flex items-center gap-1">
                      <div className="w-4 h-4 bg-gray-800 rounded" />
                      <span>Absent</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-4 h-4 bg-blue-900 rounded" />
                      <span>Light</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-4 h-4 bg-blue-700 rounded" />
                      <span>Moderate</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-4 h-4 bg-blue-500 rounded" />
                      <span>Heavy</span>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-[var(--text-muted)] text-center py-8">
                  No characters defined. Add characters in the Series settings.
                </p>
              )}
            </div>

            {/* Character Gaps */}
            {patterns.characterTrajectories.some(t => t.gaps.length > 0) && (
              <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
                <h2 className="font-semibold mb-4 flex items-center gap-2">
                  <span>🕳️</span>
                  Character Gaps
                </h2>
                <div className="space-y-3">
                  {patterns.characterTrajectories
                    .filter(t => t.gaps.length > 0)
                    .map((trajectory) => (
                      <div key={trajectory.characterId} className="bg-[var(--bg-primary)] rounded-lg p-3">
                        <div className="font-medium mb-2">{trajectory.characterName}</div>
                        <div className="flex flex-wrap gap-2">
                          {trajectory.gaps.map((gap, i) => (
                            <span
                              key={i}
                              className="text-sm px-2 py-1 bg-yellow-500/10 text-yellow-300 rounded"
                            >
                              Issues #{gap.start}–#{gap.end} ({gap.length} issues)
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Insights (shown for both views) */}
        {patterns.insights.length > 0 && (
          <div className="mt-8 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
            <h2 className="font-semibold mb-4 flex items-center gap-2">
              <span>💡</span>
              Pattern Insights
            </h2>
            <div className="grid md:grid-cols-2 gap-3">
              {patterns.insights
                .filter(i =>
                  viewMode === 'plotlines'
                    ? i.category === 'plotline' || i.category === 'structure'
                    : i.category === 'character'
                )
                .map((insight, i) => (
                  <div
                    key={i}
                    className={`p-3 rounded-lg border ${
                      insight.type === 'warning'
                        ? 'bg-yellow-500/10 border-yellow-500/30'
                        : insight.type === 'strength'
                        ? 'bg-green-500/10 border-green-500/30'
                        : insight.type === 'suggestion'
                        ? 'bg-blue-500/10 border-blue-500/30'
                        : 'bg-gray-500/10 border-gray-500/30'
                    }`}
                  >
                    <div className={`flex items-start gap-2 ${getInsightColor(insight.type)}`}>
                      <span className="shrink-0">{getInsightIcon(insight.type)}</span>
                      <div>
                        <div>{insight.message}</div>
                        {insight.issues && insight.issues.length > 0 && (
                          <div className="text-xs mt-1 opacity-70">
                            {formatIssueRange(insight.issues)}
                          </div>
                        )}
                        {insight.entities && insight.entities.length > 0 && (
                          <div className="text-xs mt-1 opacity-70">
                            {insight.entities.join(', ')}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Empty states */}
        {patterns.plotlineThreads.length === 0 && patterns.characterTrajectories.length === 0 && (
          <div className="text-center py-16">
            <div className="text-6xl mb-4 opacity-30">🕸️</div>
            <h2 className="text-xl font-medium text-[var(--text-secondary)] mb-2">No Patterns Yet</h2>
            <p className="text-[var(--text-muted)]">
              Add plotlines and characters, then assign them to issues to see patterns emerge.
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
