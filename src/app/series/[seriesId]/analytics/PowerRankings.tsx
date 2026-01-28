'use client'

import { useMemo } from 'react'

interface Character {
  id: string
  name: string
  role: string | null
}

interface DialogueBlock {
  character_id: string | null
  text: string
}

interface Panel {
  visual_description: string | null
  dialogue_blocks: DialogueBlock[]
}

interface Page {
  page_number: number
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
  acts: Act[]
}

interface Series {
  id: string
  title: string
  issues: Issue[]
  characters: Character[]
}

interface CharacterStats {
  character: Character
  dialogueAppearances: number
  visualAppearances: number
  totalAppearances: number
  issueAppearances: Set<number>
  panelAppearances: number
  pageAppearances: number
  wordCount: number
}

interface PowerRankingsProps {
  series: Series
}

export default function PowerRankings({ series }: PowerRankingsProps) {
  // Calculate character frequency stats
  const characterStats = useMemo(() => {
    const stats = new Map<string, CharacterStats>()

    // Initialize stats for all characters
    for (const character of series.characters || []) {
      stats.set(character.id, {
        character,
        dialogueAppearances: 0,
        visualAppearances: 0,
        totalAppearances: 0,
        issueAppearances: new Set(),
        panelAppearances: 0,
        pageAppearances: 0,
        wordCount: 0,
      })
    }

    // Track appearances per page to avoid double-counting
    const pageCharacterAppearances = new Map<string, Set<string>>() // pageKey -> characterIds

    // Iterate through all content
    for (const issue of series.issues || []) {
      for (const act of issue.acts || []) {
        for (const scene of act.scenes || []) {
          for (const page of scene.pages || []) {
            const pageKey = `${issue.id}-${page.page_number || Math.random()}`
            const pageCharacters = new Set<string>()

            for (const panel of page.panels || []) {
              const panelCharacters = new Set<string>()

              // Count dialogue appearances
              for (const dialogue of panel.dialogue_blocks || []) {
                if (dialogue.character_id && stats.has(dialogue.character_id)) {
                  const charStats = stats.get(dialogue.character_id)!
                  charStats.dialogueAppearances++
                  charStats.issueAppearances.add(issue.number)
                  charStats.wordCount += dialogue.text?.split(/\s+/).length || 0
                  panelCharacters.add(dialogue.character_id)
                  pageCharacters.add(dialogue.character_id)
                }
              }

              // Count visual description mentions (look for character names)
              if (panel.visual_description) {
                const desc = panel.visual_description.toLowerCase()
                for (const character of series.characters || []) {
                  const nameLower = character.name.toLowerCase()
                  // Check for whole word match
                  const regex = new RegExp(`\\b${nameLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
                  if (regex.test(desc)) {
                    const charStats = stats.get(character.id)!
                    charStats.visualAppearances++
                    charStats.issueAppearances.add(issue.number)
                    panelCharacters.add(character.id)
                    pageCharacters.add(character.id)
                  }
                }
              }

              // Count unique panel appearances
              for (const charId of panelCharacters) {
                stats.get(charId)!.panelAppearances++
              }
            }

            // Count unique page appearances
            for (const charId of pageCharacters) {
              stats.get(charId)!.pageAppearances++
            }
            pageCharacterAppearances.set(pageKey, pageCharacters)
          }
        }
      }
    }

    // Calculate total appearances and convert to array
    const result: CharacterStats[] = []
    for (const stat of stats.values()) {
      stat.totalAppearances = stat.dialogueAppearances + stat.visualAppearances
      result.push(stat)
    }

    // Sort by total appearances (descending)
    return result.sort((a, b) => b.totalAppearances - a.totalAppearances)
  }, [series])

  // Get total counts for percentage calculations
  const totalPanels = useMemo(() => {
    let count = 0
    for (const issue of series.issues || []) {
      for (const act of issue.acts || []) {
        for (const scene of act.scenes || []) {
          for (const page of scene.pages || []) {
            count += page.panels?.length || 0
          }
        }
      }
    }
    return count
  }, [series])

  const totalPages = useMemo(() => {
    let count = 0
    for (const issue of series.issues || []) {
      for (const act of issue.acts || []) {
        for (const scene of act.scenes || []) {
          count += scene.pages?.length || 0
        }
      }
    }
    return count
  }, [series])

  const maxAppearances = characterStats[0]?.totalAppearances || 1

  const getRoleColor = (role: string | null) => {
    switch (role) {
      case 'protagonist': return 'bg-blue-900 text-blue-300'
      case 'antagonist': return 'bg-red-900 text-red-300'
      case 'supporting': return 'bg-purple-900 text-purple-300'
      case 'recurring': return 'bg-amber-900 text-amber-300'
      default: return 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
    }
  }

  const getRankBadge = (rank: number) => {
    if (rank === 1) return '🥇'
    if (rank === 2) return '🥈'
    if (rank === 3) return '🥉'
    return `#${rank}`
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Character Power Rankings</h2>
        <p className="text-sm text-[var(--text-secondary)]">Character appearances across your series</p>
      </div>

      {characterStats.length === 0 ? (
        <div className="text-center py-8 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg">
          <p className="text-[var(--text-secondary)]">No characters to rank yet</p>
          <p className="text-sm text-[var(--text-secondary)] mt-1">Add characters and write some dialogue</p>
        </div>
      ) : (
        <div className="space-y-3">
          {characterStats.map((stat, index) => {
            const barWidth = (stat.totalAppearances / maxAppearances) * 100
            const pagePercentage = totalPages > 0 ? ((stat.pageAppearances / totalPages) * 100).toFixed(0) : 0
            const panelPercentage = totalPanels > 0 ? ((stat.panelAppearances / totalPanels) * 100).toFixed(0) : 0

            return (
              <div
                key={stat.character.id}
                className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xl font-bold text-[var(--text-secondary)] w-8">
                      {getRankBadge(index + 1)}
                    </span>
                    <div>
                      <span className="font-semibold text-lg">{stat.character.name}</span>
                      {stat.character.role && (
                        <span className={`ml-2 text-xs px-2 py-0.5 rounded ${getRoleColor(stat.character.role)}`}>
                          {stat.character.role}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-blue-400">{stat.totalAppearances}</div>
                    <div className="text-xs text-[var(--text-secondary)]">appearances</div>
                  </div>
                </div>

                {/* Visual bar */}
                <div className="h-2 bg-[var(--bg-tertiary)] rounded-full overflow-hidden mb-3">
                  <div
                    className="h-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all duration-300"
                    style={{ width: `${barWidth}%` }}
                  />
                </div>

                {/* Detailed stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <div className="text-[var(--text-secondary)]">Dialogue</div>
                    <div className="font-medium">{stat.dialogueAppearances}</div>
                  </div>
                  <div>
                    <div className="text-[var(--text-secondary)]">Visual mentions</div>
                    <div className="font-medium">{stat.visualAppearances}</div>
                  </div>
                  <div>
                    <div className="text-[var(--text-secondary)]">Pages</div>
                    <div className="font-medium">
                      {stat.pageAppearances} <span className="text-[var(--text-secondary)]">({pagePercentage}%)</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[var(--text-secondary)]">Panels</div>
                    <div className="font-medium">
                      {stat.panelAppearances} <span className="text-[var(--text-secondary)]">({panelPercentage}%)</span>
                    </div>
                  </div>
                </div>

                {/* Issue coverage */}
                <div className="mt-3 pt-3 border-t border-[var(--border)]">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-[var(--text-secondary)]">Issues:</span>
                    <div className="flex gap-1">
                      {series.issues.map(issue => (
                        <span
                          key={issue.id}
                          className={`px-2 py-0.5 rounded text-xs ${
                            stat.issueAppearances.has(issue.number)
                              ? 'bg-blue-900 text-blue-300'
                              : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]'
                          }`}
                        >
                          #{issue.number}
                        </span>
                      ))}
                    </div>
                    <span className="text-[var(--text-secondary)] ml-auto">
                      {stat.wordCount.toLocaleString()} words spoken
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Summary stats */}
      {characterStats.length > 0 && (
        <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
          <h3 className="font-medium mb-3">Series Summary</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-[var(--text-secondary)]">Total Characters</div>
              <div className="text-xl font-bold">{characterStats.length}</div>
            </div>
            <div>
              <div className="text-[var(--text-secondary)]">Total Pages</div>
              <div className="text-xl font-bold">{totalPages}</div>
            </div>
            <div>
              <div className="text-[var(--text-secondary)]">Total Panels</div>
              <div className="text-xl font-bold">{totalPanels}</div>
            </div>
            <div>
              <div className="text-[var(--text-secondary)]">Most Active</div>
              <div className="text-xl font-bold text-blue-400">
                {characterStats[0]?.character.name || '—'}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
