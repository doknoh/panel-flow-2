'use client'

import { useMemo } from 'react'
import { format, differenceInDays, startOfDay, subDays } from 'date-fns'

interface Session {
  id: string
  started_at: string
  ended_at: string | null
  words_written: number
  panels_created: number
  pages_created: number
}

interface DialogueBlock {
  text: string
}

interface Caption {
  text: string
}

interface Panel {
  visual_description: string | null
  dialogue_blocks: DialogueBlock[]
  captions: Caption[]
}

interface Page {
  panels: Panel[]
}

interface Scene {
  pages: Page[]
}

interface Act {
  scenes: Scene[]
}

interface Issue {
  id: string
  number: number
  title: string | null
  status: string
  acts: Act[]
}

interface Series {
  id: string
  title: string
  issues: Issue[]
}

interface AnalyticsDashboardProps {
  series: Series
  sessions: Session[]
}

export default function AnalyticsDashboard({ series, sessions }: AnalyticsDashboardProps) {
  // Calculate all stats
  const stats = useMemo(() => {
    let totalWords = 0
    let totalPanels = 0
    let totalPages = 0
    let totalDialogueWords = 0
    let totalDescriptionWords = 0
    const issueStats: {
      id: string
      number: number
      title: string | null
      status: string
      pages: number
      panels: number
      words: number
      panelsPerPage: number
    }[] = []

    for (const issue of series.issues || []) {
      let issueWords = 0
      let issuePanels = 0
      let issuePages = 0

      for (const act of issue.acts || []) {
        for (const scene of act.scenes || []) {
          for (const page of scene.pages || []) {
            issuePages++
            totalPages++

            for (const panel of page.panels || []) {
              issuePanels++
              totalPanels++

              // Count description words
              if (panel.visual_description) {
                const descWords = panel.visual_description.split(/\s+/).filter(w => w).length
                totalDescriptionWords += descWords
                issueWords += descWords
              }

              // Count dialogue words
              for (const dialogue of panel.dialogue_blocks || []) {
                if (dialogue.text) {
                  const dialogueWords = dialogue.text.split(/\s+/).filter(w => w).length
                  totalDialogueWords += dialogueWords
                  issueWords += dialogueWords
                }
              }

              // Count caption words
              for (const caption of panel.captions || []) {
                if (caption.text) {
                  const captionWords = caption.text.split(/\s+/).filter(w => w).length
                  issueWords += captionWords
                }
              }
            }
          }
        }
      }

      totalWords += issueWords

      issueStats.push({
        id: issue.id,
        number: issue.number,
        title: issue.title,
        status: issue.status,
        pages: issuePages,
        panels: issuePanels,
        words: issueWords,
        panelsPerPage: issuePages > 0 ? Math.round((issuePanels / issuePages) * 10) / 10 : 0,
      })
    }

    // Session stats
    const totalSessionMinutes = sessions.reduce((sum, session) => {
      if (session.ended_at) {
        const start = new Date(session.started_at)
        const end = new Date(session.ended_at)
        return sum + (end.getTime() - start.getTime()) / 60000
      }
      return sum
    }, 0)

    const sessionWordsWritten = sessions.reduce((sum, s) => sum + (s.words_written || 0), 0)

    // Writing streak calculation
    const sessionDates = sessions
      .map(s => startOfDay(new Date(s.started_at)).getTime())
      .filter((v, i, a) => a.indexOf(v) === i) // unique dates
      .sort((a, b) => b - a) // most recent first

    let streak = 0
    const today = startOfDay(new Date()).getTime()
    const yesterday = subDays(new Date(), 1).getTime()

    if (sessionDates.length > 0) {
      // Check if there was activity today or yesterday
      if (sessionDates[0] === today || sessionDates[0] >= startOfDay(new Date(yesterday)).getTime()) {
        streak = 1
        for (let i = 1; i < sessionDates.length; i++) {
          const expectedDate = subDays(new Date(sessionDates[0]), i).getTime()
          if (Math.abs(sessionDates[i] - startOfDay(new Date(expectedDate)).getTime()) < 86400000) {
            streak++
          } else {
            break
          }
        }
      }
    }

    // Completion stats
    const completedIssues = issueStats.filter(i => i.status === 'complete').length
    const totalIssues = issueStats.length

    return {
      totalWords,
      totalPanels,
      totalPages,
      totalDialogueWords,
      totalDescriptionWords,
      avgPanelsPerPage: totalPages > 0 ? Math.round((totalPanels / totalPages) * 10) / 10 : 0,
      dialogueRatio: totalWords > 0 ? Math.round((totalDialogueWords / totalWords) * 100) : 0,
      issueStats: issueStats.sort((a, b) => a.number - b.number),
      totalSessions: sessions.length,
      totalSessionMinutes: Math.round(totalSessionMinutes),
      avgSessionMinutes: sessions.length > 0 ? Math.round(totalSessionMinutes / sessions.length) : 0,
      sessionWordsWritten,
      writingStreak: streak,
      completedIssues,
      totalIssues,
      completionPercent: totalIssues > 0 ? Math.round((completedIssues / totalIssues) * 100) : 0,
    }
  }, [series, sessions])

  // Activity by day of week
  const activityByDay = useMemo(() => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const counts = new Array(7).fill(0)

    for (const session of sessions) {
      const day = new Date(session.started_at).getDay()
      counts[day] += session.words_written || 0
    }

    const maxCount = Math.max(...counts, 1)
    return days.map((day, i) => ({
      day,
      words: counts[i],
      percent: Math.round((counts[i] / maxCount) * 100),
    }))
  }, [sessions])

  // Recent sessions for sparkline
  const recentActivity = useMemo(() => {
    const last30Days: { date: string; words: number }[] = []
    const today = new Date()

    for (let i = 29; i >= 0; i--) {
      const date = subDays(today, i)
      const dateStr = format(date, 'yyyy-MM-dd')
      const dayWords = sessions
        .filter(s => format(new Date(s.started_at), 'yyyy-MM-dd') === dateStr)
        .reduce((sum, s) => sum + (s.words_written || 0), 0)
      last30Days.push({ date: dateStr, words: dayWords })
    }

    return last30Days
  }, [sessions])

  const maxRecentWords = Math.max(...recentActivity.map(d => d.words), 1)

  return (
    <div className="space-y-8">
      {/* Volume Stats */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Volume</h2>
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
            <div className="text-3xl font-bold">{stats.totalWords.toLocaleString()}</div>
            <div className="text-[var(--text-secondary)] text-sm">Total Words</div>
          </div>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
            <div className="text-3xl font-bold">{stats.totalPanels.toLocaleString()}</div>
            <div className="text-[var(--text-secondary)] text-sm">Total Panels</div>
          </div>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
            <div className="text-3xl font-bold">{stats.totalPages}</div>
            <div className="text-[var(--text-secondary)] text-sm">Total Pages</div>
          </div>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
            <div className="text-3xl font-bold">{stats.totalIssues}</div>
            <div className="text-[var(--text-secondary)] text-sm">Issues</div>
          </div>
        </div>
      </section>

      {/* Progress Stats */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Progress</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[var(--text-secondary)]">Series Completion</span>
              <span className="text-2xl font-bold">{stats.completionPercent}%</span>
            </div>
            <div className="h-3 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full transition-all"
                style={{ width: `${stats.completionPercent}%` }}
              />
            </div>
            <div className="text-sm text-[var(--text-secondary)] mt-2">
              {stats.completedIssues} of {stats.totalIssues} issues complete
            </div>
          </div>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
            <div className="text-sm text-[var(--text-secondary)] mb-3">Issue Progress</div>
            <div className="space-y-2">
              {stats.issueStats.slice(0, 5).map((issue) => (
                <div key={issue.id} className="flex items-center gap-3">
                  <span className="text-sm w-16">#{issue.number}</span>
                  <div className="flex-1 h-2 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        issue.status === 'complete' ? 'bg-green-500' :
                        issue.status === 'revision' ? 'bg-amber-500' :
                        issue.status === 'drafting' ? 'bg-blue-500' :
                        'bg-[var(--text-muted)]'
                      }`}
                      style={{ width: issue.status === 'complete' ? '100%' : `${Math.min((issue.pages / 40) * 100, 100)}%` }}
                    />
                  </div>
                  <span className="text-xs text-[var(--text-secondary)] w-12">{issue.pages} pg</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Consistency Stats */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Consistency</h2>
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
            <div className="text-3xl font-bold text-amber-400">{stats.writingStreak}</div>
            <div className="text-[var(--text-secondary)] text-sm">Day Streak</div>
          </div>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
            <div className="text-3xl font-bold">{stats.totalSessions}</div>
            <div className="text-[var(--text-secondary)] text-sm">Total Sessions</div>
          </div>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
            <div className="text-3xl font-bold">{stats.avgSessionMinutes}m</div>
            <div className="text-[var(--text-secondary)] text-sm">Avg Session</div>
          </div>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
            <div className="text-3xl font-bold">{Math.round(stats.totalSessionMinutes / 60)}h</div>
            <div className="text-[var(--text-secondary)] text-sm">Total Time</div>
          </div>
        </div>

        {/* Activity Heatmap */}
        <div className="mt-4 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
          <div className="text-sm text-[var(--text-secondary)] mb-3">Last 30 Days Activity</div>
          <div className="flex items-end gap-1 h-16">
            {recentActivity.map((day, i) => (
              <div
                key={i}
                className="flex-1 bg-blue-500 rounded-t transition-all hover:bg-blue-400"
                style={{
                  height: `${Math.max((day.words / maxRecentWords) * 100, day.words > 0 ? 10 : 2)}%`,
                  opacity: day.words > 0 ? 1 : 0.2,
                }}
                title={`${format(new Date(day.date), 'MMM d')}: ${day.words} words`}
              />
            ))}
          </div>
          <div className="flex justify-between text-xs text-[var(--text-secondary)] mt-2">
            <span>30 days ago</span>
            <span>Today</span>
          </div>
        </div>

        {/* Day of Week */}
        <div className="mt-4 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
          <div className="text-sm text-[var(--text-secondary)] mb-3">Words by Day of Week</div>
          <div className="flex items-end gap-2 h-20">
            {activityByDay.map((day) => (
              <div key={day.day} className="flex-1 flex flex-col items-center">
                <div
                  className="w-full bg-purple-500 rounded-t transition-all"
                  style={{ height: `${Math.max(day.percent, day.words > 0 ? 10 : 5)}%` }}
                />
                <span className="text-xs text-[var(--text-secondary)] mt-2">{day.day}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Quality Stats */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Quality Metrics</h2>
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
            <div className="text-3xl font-bold">{stats.avgPanelsPerPage}</div>
            <div className="text-[var(--text-secondary)] text-sm">Avg Panels/Page</div>
            <div className="text-xs text-[var(--text-muted)] mt-1">Industry avg: 5-6</div>
          </div>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
            <div className="text-3xl font-bold">{stats.dialogueRatio}%</div>
            <div className="text-[var(--text-secondary)] text-sm">Dialogue Ratio</div>
            <div className="text-xs text-[var(--text-muted)] mt-1">Words in dialogue</div>
          </div>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
            <div className="text-3xl font-bold">
              {stats.totalPanels > 0 ? Math.round(stats.totalWords / stats.totalPanels) : 0}
            </div>
            <div className="text-[var(--text-secondary)] text-sm">Words/Panel</div>
            <div className="text-xs text-[var(--text-muted)] mt-1">Avg density</div>
          </div>
        </div>
      </section>

      {/* Per-Issue Breakdown */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Issue Breakdown</h2>
        <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-sm text-[var(--text-secondary)]">
                <th className="px-4 py-3">Issue</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Pages</th>
                <th className="px-4 py-3 text-right">Panels</th>
                <th className="px-4 py-3 text-right">Words</th>
                <th className="px-4 py-3 text-right">Panels/Page</th>
              </tr>
            </thead>
            <tbody>
              {stats.issueStats.map((issue) => (
                <tr key={issue.id} className="border-b border-[var(--border)]/50 hover:bg-[var(--bg-tertiary)]/30">
                  <td className="px-4 py-3">
                    <span className="font-medium">#{issue.number}</span>
                    {issue.title && <span className="text-[var(--text-secondary)] ml-2">{issue.title}</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      issue.status === 'complete' ? 'bg-green-900 text-green-300' :
                      issue.status === 'revision' ? 'bg-amber-900 text-amber-300' :
                      issue.status === 'drafting' ? 'bg-blue-900 text-blue-300' :
                      'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
                    }`}>
                      {issue.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-[var(--text-primary)]">{issue.pages}</td>
                  <td className="px-4 py-3 text-right text-[var(--text-primary)]">{issue.panels}</td>
                  <td className="px-4 py-3 text-right text-[var(--text-primary)]">{issue.words.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-[var(--text-primary)]">{issue.panelsPerPage}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
