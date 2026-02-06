'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  analyzeIssueScenes,
  SceneAnalysis,
  getScoreColor,
  getScoreLabel,
  getFunctionLabel,
  getFunctionColor,
  SCENE_THRESHOLDS,
} from '@/lib/scene-analytics'

interface SceneAnalyticsClientProps {
  seriesId: string
  seriesTitle: string
  issueId: string
  issueNumber: number
  issueTitle: string | null
  acts: any[]
}

export default function SceneAnalyticsClient({
  seriesId,
  seriesTitle,
  issueId,
  issueNumber,
  issueTitle,
  acts,
}: SceneAnalyticsClientProps) {
  const [expandedScene, setExpandedScene] = useState<string | null>(null)

  // Analyze all scenes
  const sceneAnalyses = useMemo(() => {
    return analyzeIssueScenes(acts)
  }, [acts])

  // Calculate overall stats
  const overallStats = useMemo(() => {
    const totalScenes = sceneAnalyses.length
    const avgScore = totalScenes > 0
      ? Math.round(sceneAnalyses.reduce((sum, s) => sum + s.efficiencyScore, 0) / totalScenes)
      : 0
    const totalPages = sceneAnalyses.reduce((sum, s) => sum + s.metrics.pageCount, 0)
    const totalPanels = sceneAnalyses.reduce((sum, s) => sum + s.metrics.panelCount, 0)
    const totalWords = sceneAnalyses.reduce((sum, s) => sum + s.metrics.wordCount, 0)

    const warningCount = sceneAnalyses.reduce(
      (sum, s) => sum + s.insights.filter(i => i.type === 'warning').length,
      0
    )
    const strengthCount = sceneAnalyses.reduce(
      (sum, s) => sum + s.insights.filter(i => i.type === 'strength').length,
      0
    )

    return {
      totalScenes,
      avgScore,
      totalPages,
      totalPanels,
      totalWords,
      warningCount,
      strengthCount,
    }
  }, [sceneAnalyses])

  // Group by act
  const scenesByAct = useMemo(() => {
    const grouped: { actId: string; actName: string; scenes: SceneAnalysis[] }[] = []
    let sceneIndex = 0

    for (const act of acts) {
      const actScenes: SceneAnalysis[] = []
      for (let i = 0; i < (act.scenes || []).length; i++) {
        if (sceneIndex < sceneAnalyses.length) {
          actScenes.push(sceneAnalyses[sceneIndex])
          sceneIndex++
        }
      }
      grouped.push({
        actId: act.id,
        actName: act.name || `Act ${act.sort_order + 1}`,
        scenes: actScenes,
      })
    }

    return grouped
  }, [acts, sceneAnalyses])

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
            <span className="text-[var(--text-primary)]">Scene Analytics</span>
          </div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            📊 Scene Analytics
          </h1>
          {issueTitle && (
            <p className="text-[var(--text-muted)] mt-1">{issueTitle}</p>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* Overall Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-8">
          <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
            <div className={`text-2xl font-bold ${getScoreColor(overallStats.avgScore)}`}>
              {overallStats.avgScore}
            </div>
            <div className="text-[var(--text-muted)] text-sm">Avg Score</div>
          </div>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
            <div className="text-2xl font-bold">{overallStats.totalScenes}</div>
            <div className="text-[var(--text-muted)] text-sm">Scenes</div>
          </div>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
            <div className="text-2xl font-bold">{overallStats.totalPages}</div>
            <div className="text-[var(--text-muted)] text-sm">Pages</div>
          </div>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
            <div className="text-2xl font-bold">{overallStats.totalPanels}</div>
            <div className="text-[var(--text-muted)] text-sm">Panels</div>
          </div>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
            <div className="text-2xl font-bold">{overallStats.totalWords}</div>
            <div className="text-[var(--text-muted)] text-sm">Words</div>
          </div>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
            <div className="text-2xl font-bold text-green-400">{overallStats.strengthCount}</div>
            <div className="text-[var(--text-muted)] text-sm">Strengths</div>
          </div>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
            <div className="text-2xl font-bold text-yellow-400">{overallStats.warningCount}</div>
            <div className="text-[var(--text-muted)] text-sm">Warnings</div>
          </div>
        </div>

        {/* Thresholds Reference */}
        <div className="mb-6 p-4 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg">
          <h3 className="font-medium mb-2 text-sm text-[var(--text-muted)]">Reference Thresholds</h3>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-[var(--text-muted)]">Words/Page:</span>{' '}
              <span className="text-green-400">{SCENE_THRESHOLDS.wordsPerPage.ideal.min}-{SCENE_THRESHOLDS.wordsPerPage.ideal.max}</span>
              <span className="text-[var(--text-muted)]"> ideal</span>
            </div>
            <div>
              <span className="text-[var(--text-muted)]">Panels/Page:</span>{' '}
              <span className="text-green-400">{SCENE_THRESHOLDS.panelsPerPage.ideal.min}-{SCENE_THRESHOLDS.panelsPerPage.ideal.max}</span>
              <span className="text-[var(--text-muted)]"> ideal</span>
            </div>
            <div>
              <span className="text-[var(--text-muted)]">Dialogue Ratio:</span>{' '}
              <span className="text-green-400">{Math.round(SCENE_THRESHOLDS.dialogueRatio.ideal.min * 100)}-{Math.round(SCENE_THRESHOLDS.dialogueRatio.ideal.max * 100)}%</span>
              <span className="text-[var(--text-muted)]"> ideal</span>
            </div>
          </div>
        </div>

        {/* Scene Analysis by Act */}
        {scenesByAct.map(({ actId, actName, scenes }) => (
          <div key={actId} className="mb-8">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span className="text-[var(--text-muted)]">🎭</span>
              {actName}
              <span className="text-sm font-normal text-[var(--text-muted)]">
                ({scenes.length} scene{scenes.length !== 1 ? 's' : ''})
              </span>
            </h2>

            <div className="space-y-3">
              {scenes.map((analysis) => (
                <div
                  key={analysis.metrics.sceneId}
                  className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg overflow-hidden"
                >
                  {/* Scene Header */}
                  <button
                    onClick={() => setExpandedScene(
                      expandedScene === analysis.metrics.sceneId ? null : analysis.metrics.sceneId
                    )}
                    className="w-full p-4 text-left hover:bg-[var(--bg-tertiary)] transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className={`text-2xl font-bold ${getScoreColor(analysis.efficiencyScore)}`}>
                          {analysis.efficiencyScore}
                        </span>
                        <div>
                          <h3 className="font-medium">{analysis.metrics.sceneName}</h3>
                          <div className="flex items-center gap-3 text-sm text-[var(--text-muted)]">
                            <span>{analysis.metrics.pageCount} pages</span>
                            <span>·</span>
                            <span>{analysis.metrics.panelCount} panels</span>
                            <span>·</span>
                            <span>{analysis.metrics.wordCount} words</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${getFunctionColor(analysis.dramaticFunction)}`}>
                          {getFunctionLabel(analysis.dramaticFunction)}
                        </span>
                        <span className="text-[var(--text-muted)]">
                          {expandedScene === analysis.metrics.sceneId ? '▼' : '▶'}
                        </span>
                      </div>
                    </div>

                    {/* Quick metrics bar */}
                    <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
                      <MetricBar
                        label="Words/Page"
                        value={analysis.metrics.wordsPerPage}
                        min={SCENE_THRESHOLDS.wordsPerPage.ideal.min}
                        max={SCENE_THRESHOLDS.wordsPerPage.ideal.max}
                        warnLow={SCENE_THRESHOLDS.wordsPerPage.sparse}
                        warnHigh={SCENE_THRESHOLDS.wordsPerPage.dense}
                      />
                      <MetricBar
                        label="Panels/Page"
                        value={analysis.metrics.panelsPerPage}
                        min={SCENE_THRESHOLDS.panelsPerPage.ideal.min}
                        max={SCENE_THRESHOLDS.panelsPerPage.ideal.max}
                        warnLow={SCENE_THRESHOLDS.panelsPerPage.sparse}
                        warnHigh={SCENE_THRESHOLDS.panelsPerPage.cramped}
                      />
                      <MetricBar
                        label="Dialogue"
                        value={Math.round(analysis.metrics.dialogueRatio * 100)}
                        min={Math.round(SCENE_THRESHOLDS.dialogueRatio.ideal.min * 100)}
                        max={Math.round(SCENE_THRESHOLDS.dialogueRatio.ideal.max * 100)}
                        warnLow={Math.round(SCENE_THRESHOLDS.dialogueRatio.allAction * 100)}
                        warnHigh={Math.round(SCENE_THRESHOLDS.dialogueRatio.talkingHeads * 100)}
                        suffix="%"
                      />
                    </div>
                  </button>

                  {/* Expanded Details */}
                  {expandedScene === analysis.metrics.sceneId && (
                    <div className="border-t border-[var(--border)] p-4 bg-[var(--bg-primary)]">
                      {/* Insights */}
                      {analysis.insights.length > 0 ? (
                        <div className="space-y-2">
                          <h4 className="text-sm font-medium text-[var(--text-muted)] mb-2">Insights</h4>
                          {analysis.insights.map((insight, idx) => (
                            <div
                              key={idx}
                              className={`flex items-start gap-2 text-sm p-2 rounded ${
                                insight.type === 'warning'
                                  ? 'bg-yellow-500/10 text-yellow-300'
                                  : insight.type === 'strength'
                                  ? 'bg-green-500/10 text-green-300'
                                  : 'bg-blue-500/10 text-blue-300'
                              }`}
                            >
                              <span className="shrink-0">
                                {insight.type === 'warning' ? '⚠️' : insight.type === 'strength' ? '✅' : '💡'}
                              </span>
                              <div>
                                <div>{insight.message}</div>
                                {insight.suggestion && (
                                  <div className="mt-1 text-xs opacity-80">{insight.suggestion}</div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-[var(--text-muted)]">No specific insights for this scene.</p>
                      )}

                      {/* Detailed metrics */}
                      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div className="bg-[var(--bg-secondary)] rounded p-2">
                          <div className="text-[var(--text-muted)]">Silent Panels</div>
                          <div className="font-medium">{analysis.metrics.silentPanels}</div>
                        </div>
                        <div className="bg-[var(--bg-secondary)] rounded p-2">
                          <div className="text-[var(--text-muted)]">Dialogue Panels</div>
                          <div className="font-medium">{analysis.metrics.dialoguePanels}</div>
                        </div>
                        <div className="bg-[var(--bg-secondary)] rounded p-2">
                          <div className="text-[var(--text-muted)]">Score Grade</div>
                          <div className={`font-medium ${getScoreColor(analysis.efficiencyScore)}`}>
                            {getScoreLabel(analysis.efficiencyScore)}
                          </div>
                        </div>
                        <div className="bg-[var(--bg-secondary)] rounded p-2">
                          <div className="text-[var(--text-muted)]">Dramatic Role</div>
                          <div className="font-medium">{getFunctionLabel(analysis.dramaticFunction)}</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Empty state */}
        {sceneAnalyses.length === 0 && (
          <div className="text-center py-16">
            <div className="text-6xl mb-4 opacity-30">📊</div>
            <h2 className="text-xl font-medium text-[var(--text-secondary)] mb-2">No scenes to analyze</h2>
            <p className="text-[var(--text-muted)]">
              Add scenes to this issue to see analytics.
            </p>
          </div>
        )}
      </main>
    </div>
  )
}

// Metric bar component
function MetricBar({
  label,
  value,
  min,
  max,
  warnLow,
  warnHigh,
  suffix = '',
}: {
  label: string
  value: number
  min: number
  max: number
  warnLow: number
  warnHigh: number
  suffix?: string
}) {
  const isIdeal = value >= min && value <= max
  const isTooLow = value < warnLow
  const isTooHigh = value > warnHigh

  const barColor = isIdeal
    ? 'bg-green-500'
    : isTooLow || isTooHigh
    ? 'bg-yellow-500'
    : 'bg-blue-500'

  // Calculate bar width as percentage of range
  const barWidth = Math.min(100, Math.max(5, (value / warnHigh) * 100))

  return (
    <div>
      <div className="flex justify-between text-xs text-[var(--text-muted)] mb-1">
        <span>{label}</span>
        <span className={isIdeal ? 'text-green-400' : isTooLow || isTooHigh ? 'text-yellow-400' : ''}>
          {value}{suffix}
        </span>
      </div>
      <div className="h-1.5 bg-[var(--bg-primary)] rounded-full overflow-hidden">
        <div
          className={`h-full ${barColor} rounded-full transition-all`}
          style={{ width: `${barWidth}%` }}
        />
      </div>
    </div>
  )
}
