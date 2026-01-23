'use client'

import { useState } from 'react'
import { useToast } from '@/contexts/ToastContext'

interface Issue {
  id: string
  number: number
  title: string | null
  status: string
  summary: string | null
  themes: string | null
  acts: any[]
}

interface Series {
  id: string
  title: string
  issues: Issue[]
}

interface RankedIssue {
  issueNumber: number
  score: number
  strengths: string[]
  weaknesses: string[]
  recommendation: string
}

interface PowerRankingsProps {
  series: Series
}

export default function PowerRankings({ series }: PowerRankingsProps) {
  const [rankings, setRankings] = useState<RankedIssue[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [overallAnalysis, setOverallAnalysis] = useState<string | null>(null)
  const { showToast } = useToast()

  const generateRankings = async () => {
    setIsGenerating(true)

    try {
      // Build content summaries for each issue
      const issueSummaries = series.issues.map(issue => {
        const acts = issue.acts || []
        let pageCount = 0
        let panelCount = 0
        let wordCount = 0
        const sceneList: string[] = []

        for (const act of acts) {
          for (const scene of act.scenes || []) {
            if (scene.title) sceneList.push(scene.title)
            for (const page of scene.pages || []) {
              pageCount++
              for (const panel of page.panels || []) {
                panelCount++
                if (panel.visual_description) {
                  wordCount += panel.visual_description.split(/\s+/).length
                }
                for (const d of panel.dialogue_blocks || []) {
                  if (d.text) wordCount += d.text.split(/\s+/).length
                }
              }
            }
          }
        }

        return {
          number: issue.number,
          title: issue.title,
          status: issue.status,
          summary: issue.summary,
          themes: issue.themes,
          pageCount,
          panelCount,
          wordCount,
          actCount: acts.length,
          scenes: sceneList.slice(0, 10).join(', '),
        }
      })

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Analyze and rank these comic book issues by quality. Consider:
- Structural coherence (clear acts, pacing)
- Content density (pages, panels, word count)
- Thematic clarity
- Scene variety and progression

For each issue, provide:
1. A score from 1-10
2. 2-3 specific strengths
3. 1-2 areas for improvement
4. One actionable recommendation

Return ONLY valid JSON in this exact format (no markdown):
{
  "rankings": [
    {
      "issueNumber": 1,
      "score": 8,
      "strengths": ["Strong opening hook", "Good pacing"],
      "weaknesses": ["Act 2 drags slightly"],
      "recommendation": "Tighten the middle section by cutting 2-3 pages"
    }
  ],
  "overallAnalysis": "Brief 2-3 sentence analysis of the series as a whole"
}

Here are the issues to analyze:

${JSON.stringify(issueSummaries, null, 2)}`,
          context: {
            seriesTitle: series.title,
          },
        }),
      })

      if (!response.ok) throw new Error('Failed to generate rankings')

      const data = await response.json()

      // Parse the JSON response
      let jsonStr = data.message
      jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '')

      const startIdx = jsonStr.indexOf('{')
      const endIdx = jsonStr.lastIndexOf('}')

      if (startIdx === -1 || endIdx === -1) {
        throw new Error('Invalid response format')
      }

      const parsed = JSON.parse(jsonStr.slice(startIdx, endIdx + 1))
      setRankings(parsed.rankings.sort((a: RankedIssue, b: RankedIssue) => b.score - a.score))
      setOverallAnalysis(parsed.overallAnalysis)
      showToast('Rankings generated', 'success')
    } catch (error) {
      console.error('Error generating rankings:', error)
      showToast('Failed to generate rankings', 'error')
    } finally {
      setIsGenerating(false)
    }
  }

  const getScoreColor = (score: number) => {
    if (score >= 8) return 'text-green-400'
    if (score >= 6) return 'text-amber-400'
    return 'text-red-400'
  }

  const getScoreBg = (score: number) => {
    if (score >= 8) return 'bg-green-900/30 border-green-800'
    if (score >= 6) return 'bg-amber-900/30 border-amber-800'
    return 'bg-red-900/30 border-red-800'
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Power Rankings</h2>
          <p className="text-sm text-zinc-400">AI-powered quality assessment of your issues</p>
        </div>
        <button
          onClick={generateRankings}
          disabled={isGenerating || series.issues.length === 0}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:cursor-not-allowed px-4 py-2 rounded font-medium"
        >
          {isGenerating ? 'Analyzing...' : rankings.length > 0 ? 'Regenerate' : 'Generate Rankings'}
        </button>
      </div>

      {series.issues.length === 0 && (
        <div className="text-center py-8 bg-zinc-900 border border-zinc-800 rounded-lg">
          <p className="text-zinc-400">No issues to analyze yet</p>
        </div>
      )}

      {overallAnalysis && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <h3 className="font-medium mb-2">Overall Analysis</h3>
          <p className="text-zinc-300">{overallAnalysis}</p>
        </div>
      )}

      {rankings.length > 0 && (
        <div className="space-y-4">
          {rankings.map((ranking, index) => {
            const issue = series.issues.find(i => i.number === ranking.issueNumber)
            return (
              <div
                key={ranking.issueNumber}
                className={`border rounded-lg p-4 ${getScoreBg(ranking.score)}`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl font-bold text-zinc-500">#{index + 1}</span>
                    <div>
                      <span className="font-semibold">Issue #{ranking.issueNumber}</span>
                      {issue?.title && (
                        <span className="text-zinc-400 ml-2">{issue.title}</span>
                      )}
                    </div>
                  </div>
                  <div className={`text-3xl font-bold ${getScoreColor(ranking.score)}`}>
                    {ranking.score}/10
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-medium text-green-400 mb-2">Strengths</h4>
                    <ul className="text-sm space-y-1">
                      {ranking.strengths.map((strength, i) => (
                        <li key={i} className="text-zinc-300">• {strength}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-amber-400 mb-2">Areas to Improve</h4>
                    <ul className="text-sm space-y-1">
                      {ranking.weaknesses.map((weakness, i) => (
                        <li key={i} className="text-zinc-300">• {weakness}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-zinc-700">
                  <h4 className="text-sm font-medium text-blue-400 mb-1">Recommendation</h4>
                  <p className="text-sm text-zinc-300">{ranking.recommendation}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
