'use client'

import { useMemo, useState } from 'react'
import {
  BarChart3,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Lightbulb,
  ChevronDown,
  ChevronUp,
  Minus,
} from 'lucide-react'
import {
  analyzePacing,
  getScoreColor,
  getScoreLabel,
  PACING_THRESHOLDS,
  type PageData,
  type PacingAnalysis,
  type PagePacingMetric,
  type PacingInsight,
} from '@/lib/pacing'

interface PacingAnalystProps {
  pages: PageData[]
  onPageClick?: (pageId: string) => void
}

export default function PacingAnalyst({ pages, onPageClick }: PacingAnalystProps) {
  const [expandedInsights, setExpandedInsights] = useState(true)

  const analysis = useMemo(() => analyzePacing(pages), [pages])

  if (pages.length === 0) {
    return (
      <div className="p-6 text-center text-[var(--text-muted)]">
        <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p>Add pages to see pacing analysis</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Overall Score */}
      <ScoreCard score={analysis.score} overall={analysis.overall} />

      {/* Charts */}
      <div className="space-y-4">
        <RhythmChart
          title="Words per Page"
          metrics={analysis.pages}
          getValue={(p) => p.wordCount}
          threshold={PACING_THRESHOLDS.wordsPerPage.warning}
          idealRange={PACING_THRESHOLDS.wordsPerPage.ideal}
          onBarClick={onPageClick}
        />
        <RhythmChart
          title="Panels per Page"
          metrics={analysis.pages}
          getValue={(p) => p.panelCount}
          threshold={PACING_THRESHOLDS.panelsPerPage.cramped}
          idealRange={PACING_THRESHOLDS.panelsPerPage.ideal}
          onBarClick={onPageClick}
        />
      </div>

      {/* Quick Stats */}
      <QuickStats overall={analysis.overall} />

      {/* Insights */}
      <InsightsList
        insights={analysis.insights}
        expanded={expandedInsights}
        onToggle={() => setExpandedInsights(!expandedInsights)}
        onPageClick={onPageClick}
        pages={analysis.pages}
      />
    </div>
  )
}

// --- Score Card ---
function ScoreCard({
  score,
  overall,
}: {
  score: number
  overall: PacingAnalysis['overall']
}) {
  const scoreColor = getScoreColor(score)
  const scoreLabel = getScoreLabel(score)

  return (
    <div className="bg-[var(--bg-secondary)] rounded-xl p-5 border border-[var(--border)]">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-[var(--text-muted)] mb-1">Pacing Score</h3>
          <div className="flex items-baseline gap-2">
            <span className={`text-4xl font-bold ${scoreColor}`}>{score}</span>
            <span className="text-lg text-[var(--text-muted)]">/ 100</span>
          </div>
          <p className={`text-sm ${scoreColor} mt-1`}>{scoreLabel}</p>
        </div>
        <div className="text-right text-sm text-[var(--text-muted)]">
          <p>{overall.totalPages} pages</p>
          <p>{overall.totalPanels} panels</p>
          <p>{overall.totalWords.toLocaleString()} words</p>
        </div>
      </div>
    </div>
  )
}

// --- Rhythm Chart ---
function RhythmChart({
  title,
  metrics,
  getValue,
  threshold,
  idealRange,
  onBarClick,
}: {
  title: string
  metrics: PagePacingMetric[]
  getValue: (p: PagePacingMetric) => number
  threshold: number
  idealRange: { min: number; max: number }
  onBarClick?: (pageId: string) => void
}) {
  const maxValue = Math.max(...metrics.map(getValue), threshold)

  return (
    <div className="bg-[var(--bg-secondary)] rounded-xl p-4 border border-[var(--border)]">
      <h4 className="text-sm font-medium text-[var(--text-secondary)] mb-3">{title}</h4>

      {/* Ideal range indicator */}
      <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] mb-2">
        <span className="w-3 h-3 bg-blue-500/30 rounded" />
        <span>Ideal: {idealRange.min}–{idealRange.max}</span>
        <span className="w-3 h-3 bg-red-500/50 rounded ml-2" />
        <span>Warning: &gt;{threshold}</span>
      </div>

      {/* Chart */}
      <div className="flex items-end gap-1 h-24">
        {metrics.map((page) => {
          const value = getValue(page)
          const height = maxValue > 0 ? (value / maxValue) * 100 : 0
          const isOverThreshold = value > threshold
          const isInIdealRange = value >= idealRange.min && value <= idealRange.max
          const isOddPage = page.isOddPage

          let barColor = 'bg-blue-500'
          if (isOverThreshold) barColor = 'bg-red-500'
          else if (isInIdealRange) barColor = 'bg-green-500'
          else if (value < idealRange.min) barColor = 'bg-yellow-500'

          return (
            <button
              key={page.pageId}
              onClick={() => onBarClick?.(page.pageId)}
              className="flex-1 flex flex-col items-center group cursor-pointer"
              title={`Page ${page.pageNumber}: ${value} ${title.toLowerCase().includes('word') ? 'words' : 'panels'}`}
            >
              <div
                className={`w-full ${barColor} rounded-t transition-all group-hover:opacity-80`}
                style={{ height: `${Math.max(height, 4)}%` }}
              />
              <span
                className={`text-[10px] mt-1 ${
                  isOddPage ? 'text-[var(--text-secondary)]' : 'text-[var(--text-muted)]'
                }`}
              >
                {page.pageNumber}
              </span>
            </button>
          )
        })}
      </div>

      {/* Threshold line (visual reference) */}
      <div
        className="relative w-full border-t border-dashed border-red-500/50 -mt-[calc(24px*var(--threshold-ratio))]"
        style={{ '--threshold-ratio': threshold / maxValue } as React.CSSProperties}
      />
    </div>
  )
}

// --- Quick Stats ---
function QuickStats({ overall }: { overall: PacingAnalysis['overall'] }) {
  const stats = [
    {
      label: 'Avg Words/Page',
      value: overall.avgWordsPerPage,
      ideal: '30–100',
      isGood: overall.avgWordsPerPage >= 30 && overall.avgWordsPerPage <= 100,
    },
    {
      label: 'Avg Panels/Page',
      value: overall.avgPanelsPerPage,
      ideal: '4–6',
      isGood: overall.avgPanelsPerPage >= 4 && overall.avgPanelsPerPage <= 6,
    },
    {
      label: 'Dialogue Panels',
      value: `${Math.round(overall.dialoguePanelRatio * 100)}%`,
      ideal: '40–60%',
      isGood: overall.dialoguePanelRatio >= 0.4 && overall.dialoguePanelRatio <= 0.6,
    },
    {
      label: 'Silent Panels',
      value: `${Math.round(overall.silentPanelRatio * 100)}%`,
      ideal: '10–20%',
      isGood: overall.silentPanelRatio >= 0.1 && overall.silentPanelRatio <= 0.2,
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="bg-[var(--bg-secondary)] rounded-lg p-3 border border-[var(--border)]"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--text-muted)]">{stat.label}</span>
            {stat.isGood ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
            ) : (
              <Minus className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            )}
          </div>
          <div className="text-lg font-semibold mt-1">{stat.value}</div>
          <div className="text-xs text-[var(--text-muted)]">Ideal: {stat.ideal}</div>
        </div>
      ))}
    </div>
  )
}

// --- Insights List ---
function InsightsList({
  insights,
  expanded,
  onToggle,
  onPageClick,
  pages,
}: {
  insights: PacingInsight[]
  expanded: boolean
  onToggle: () => void
  onPageClick?: (pageId: string) => void
  pages: PagePacingMetric[]
}) {
  const warnings = insights.filter((i) => i.type === 'warning')
  const suggestions = insights.filter((i) => i.type === 'suggestion')
  const strengths = insights.filter((i) => i.type === 'strength')

  const getPageId = (pageNumber: number) => {
    const page = pages.find((p) => p.pageNumber === pageNumber)
    return page?.pageId
  }

  return (
    <div className="bg-[var(--bg-secondary)] rounded-xl border border-[var(--border)] overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 hover:bg-[var(--bg-tertiary)] transition-colors"
      >
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-[var(--text-muted)]" />
          <span className="font-medium">Pacing Insights</span>
          <span className="text-sm text-[var(--text-muted)]">
            ({warnings.length} issues, {suggestions.length} suggestions)
          </span>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-[var(--text-muted)]" />
        ) : (
          <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-[var(--border)] divide-y divide-[var(--border)]">
          {warnings.length === 0 && suggestions.length === 0 && strengths.length === 0 && (
            <div className="p-4 text-center text-[var(--text-muted)]">
              No pacing issues detected
            </div>
          )}

          {warnings.map((insight, idx) => (
            <InsightCard
              key={`warning-${idx}`}
              insight={insight}
              icon={<AlertTriangle className="w-4 h-4" />}
              iconColor="text-red-500"
              bgColor="bg-red-500/10"
              onPageClick={(pageNum) => {
                const pageId = getPageId(pageNum)
                if (pageId) onPageClick?.(pageId)
              }}
            />
          ))}

          {suggestions.map((insight, idx) => (
            <InsightCard
              key={`suggestion-${idx}`}
              insight={insight}
              icon={<Lightbulb className="w-4 h-4" />}
              iconColor="text-yellow-500"
              bgColor="bg-yellow-500/10"
              onPageClick={(pageNum) => {
                const pageId = getPageId(pageNum)
                if (pageId) onPageClick?.(pageId)
              }}
            />
          ))}

          {strengths.map((insight, idx) => (
            <InsightCard
              key={`strength-${idx}`}
              insight={insight}
              icon={<CheckCircle2 className="w-4 h-4" />}
              iconColor="text-green-500"
              bgColor="bg-green-500/10"
              onPageClick={(pageNum) => {
                const pageId = getPageId(pageNum)
                if (pageId) onPageClick?.(pageId)
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function InsightCard({
  insight,
  icon,
  iconColor,
  bgColor,
  onPageClick,
}: {
  insight: PacingInsight
  icon: React.ReactNode
  iconColor: string
  bgColor: string
  onPageClick: (pageNum: number) => void
}) {
  return (
    <div className="p-4">
      <div className="flex gap-3">
        <div className={`w-8 h-8 rounded-lg ${bgColor} flex items-center justify-center flex-shrink-0 ${iconColor}`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{insight.message}</p>
          {insight.suggestion && (
            <p className="text-sm text-[var(--text-muted)] mt-1">{insight.suggestion}</p>
          )}
          {insight.pages.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {insight.pages.slice(0, 8).map((pageNum) => (
                <button
                  key={pageNum}
                  onClick={() => onPageClick(pageNum)}
                  className="px-2 py-0.5 text-xs bg-[var(--bg-tertiary)] hover:bg-[var(--bg-primary)] rounded transition-colors"
                >
                  Page {pageNum}
                </button>
              ))}
              {insight.pages.length > 8 && (
                <span className="px-2 py-0.5 text-xs text-[var(--text-muted)]">
                  +{insight.pages.length - 8} more
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
