'use client'

import { useState, useMemo } from 'react'
import { useToast } from '@/contexts/ToastContext'

interface Character {
  id: string
  name: string
}

interface Location {
  id: string
  name: string
}

interface DialogueBlock {
  character_id: string | null
  text: string | null
}

interface Caption {
  caption_type: string | null
  text: string | null
}

interface Panel {
  visual_description: string | null
  dialogue_blocks: DialogueBlock[]
  captions: Caption[]
}

interface Page {
  page_number: number
  panels: Panel[]
}

interface Scene {
  title: string | null
  pages: Page[]
}

interface Act {
  number: number
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
  characters: Character[]
  locations: Location[]
  issues: Issue[]
}

interface ContinuityIssue {
  type: 'character' | 'location' | 'timeline' | 'dialogue' | 'visual'
  severity: 'error' | 'warning' | 'info'
  description: string
  issueNumbers: number[]
  details: string
}

interface ContinuityCheckerProps {
  series: Series
}

export default function ContinuityChecker({ series }: ContinuityCheckerProps) {
  const [issues, setIssues] = useState<ContinuityIssue[]>([])
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [hasAnalyzed, setHasAnalyzed] = useState(false)
  const [filter, setFilter] = useState<'all' | 'error' | 'warning' | 'info'>('all')
  const { showToast } = useToast()

  const sortedIssues = useMemo(() =>
    [...(series.issues || [])].sort((a, b) => a.number - b.number),
    [series.issues]
  )

  // Extract all text content from an issue for analysis
  const extractIssueContent = (issue: Issue) => {
    const content: string[] = []
    const characterAppearances: Set<string> = new Set()
    const locationMentions: Set<string> = new Set()

    for (const act of issue.acts || []) {
      for (const scene of act.scenes || []) {
        if (scene.title) content.push(`Scene: ${scene.title}`)

        for (const page of scene.pages || []) {
          for (const panel of page.panels || []) {
            if (panel.visual_description) {
              content.push(`Page ${page.page_number}: ${panel.visual_description}`)

              // Check for character mentions
              for (const char of series.characters) {
                if (panel.visual_description.toLowerCase().includes(char.name.toLowerCase())) {
                  characterAppearances.add(char.id)
                }
              }

              // Check for location mentions
              for (const loc of series.locations) {
                if (panel.visual_description.toLowerCase().includes(loc.name.toLowerCase())) {
                  locationMentions.add(loc.id)
                }
              }
            }

            for (const dialogue of panel.dialogue_blocks || []) {
              if (dialogue.character_id) {
                characterAppearances.add(dialogue.character_id)
              }
              if (dialogue.text) {
                content.push(`Dialogue: "${dialogue.text}"`)
              }
            }

            for (const caption of panel.captions || []) {
              if (caption.text) {
                content.push(`Caption (${caption.caption_type || 'narrative'}): ${caption.text}`)
              }
            }
          }
        }
      }
    }

    return {
      text: content.join('\n'),
      characterIds: Array.from(characterAppearances),
      locationIds: Array.from(locationMentions),
    }
  }

  // Run local continuity checks (fast, no AI)
  const runLocalChecks = (): ContinuityIssue[] => {
    const localIssues: ContinuityIssue[] = []
    const characterFirstAppearance: Map<string, number> = new Map()
    const characterLastAppearance: Map<string, number> = new Map()

    // Analyze each issue
    for (const issue of sortedIssues) {
      const { characterIds } = extractIssueContent(issue)

      for (const charId of characterIds) {
        if (!characterFirstAppearance.has(charId)) {
          characterFirstAppearance.set(charId, issue.number)
        }
        characterLastAppearance.set(charId, issue.number)
      }
    }

    // Check for characters who disappear and reappear
    for (const [charId, firstIssue] of characterFirstAppearance) {
      const lastIssue = characterLastAppearance.get(charId)!
      const character = series.characters.find(c => c.id === charId)
      if (!character) continue

      // Find gaps in appearances
      const appearances: number[] = []
      for (const issue of sortedIssues) {
        const { characterIds } = extractIssueContent(issue)
        if (characterIds.includes(charId)) {
          appearances.push(issue.number)
        }
      }

      // Check for gaps larger than 2 issues
      for (let i = 1; i < appearances.length; i++) {
        const gap = appearances[i] - appearances[i - 1]
        if (gap > 2) {
          localIssues.push({
            type: 'character',
            severity: 'warning',
            description: `${character.name} disappears for ${gap - 1} issues`,
            issueNumbers: [appearances[i - 1], appearances[i]],
            details: `Last seen in Issue #${appearances[i - 1]}, reappears in Issue #${appearances[i]}. Consider adding a reference to explain their absence.`,
          })
        }
      }
    }

    // Check for issues with no character dialogue
    for (const issue of sortedIssues) {
      let hasDialogue = false
      for (const act of issue.acts || []) {
        for (const scene of act.scenes || []) {
          for (const page of scene.pages || []) {
            for (const panel of page.panels || []) {
              if (panel.dialogue_blocks?.some(d => d.text)) {
                hasDialogue = true
                break
              }
            }
          }
        }
      }

      if (!hasDialogue && issue.acts?.length > 0) {
        localIssues.push({
          type: 'dialogue',
          severity: 'info',
          description: `Issue #${issue.number} has no dialogue`,
          issueNumbers: [issue.number],
          details: 'This issue contains no dialogue. This may be intentional for a silent issue, but verify this is the desired effect.',
        })
      }
    }

    return localIssues
  }

  // Run AI-powered deep analysis
  const runAIAnalysis = async (): Promise<ContinuityIssue[]> => {
    // Prepare content for AI analysis
    const issueContents = sortedIssues.map(issue => ({
      number: issue.number,
      title: issue.title,
      ...extractIssueContent(issue),
    }))

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `Analyze this comic series for continuity issues. Look for:
1. Character inconsistencies (personality changes, unexplained abilities, conflicting backstory)
2. Timeline problems (events that don't make chronological sense)
3. Location errors (impossible travel, inconsistent settings)
4. Dialogue inconsistencies (characters contradicting themselves or others)
5. Visual continuity (described appearances that change unexpectedly)

Return ONLY valid JSON (no markdown) in this format:
{
  "issues": [
    {
      "type": "character|location|timeline|dialogue|visual",
      "severity": "error|warning|info",
      "description": "Brief description",
      "issueNumbers": [1, 2],
      "details": "Full explanation of the issue and potential fix"
    }
  ]
}

Characters in this series: ${series.characters.map(c => c.name).join(', ')}
Locations in this series: ${series.locations.map(l => l.name).join(', ')}

Issue contents:
${issueContents.map(ic => `
--- Issue #${ic.number}: ${ic.title || 'Untitled'} ---
${ic.text.slice(0, 3000)}
`).join('\n')}`,
        context: {
          seriesTitle: series.title,
          totalIssues: sortedIssues.length,
        },
      }),
    })

    if (!response.ok) throw new Error('AI analysis failed')

    const data = await response.json()

    // Parse response
    let jsonStr = data.response
    jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '')

    const startIdx = jsonStr.indexOf('{')
    const endIdx = jsonStr.lastIndexOf('}')
    const parsed = JSON.parse(jsonStr.slice(startIdx, endIdx + 1))

    return parsed.issues || []
  }

  const analyze = async () => {
    setIsAnalyzing(true)
    setIssues([])

    try {
      // Run local checks first (fast)
      const localIssues = runLocalChecks()
      setIssues(localIssues)

      // Then run AI analysis if there's content
      const hasContent = sortedIssues.some(i => i.acts?.length > 0)
      if (hasContent) {
        const aiIssues = await runAIAnalysis()
        setIssues([...localIssues, ...aiIssues])
      }

      setHasAnalyzed(true)
      showToast('Continuity analysis complete', 'success')
    } catch (error) {
      console.error('Error analyzing continuity:', error)
      showToast('Failed to complete analysis', 'error')
    } finally {
      setIsAnalyzing(false)
    }
  }

  const filteredIssues = filter === 'all'
    ? issues
    : issues.filter(i => i.severity === filter)

  const issuesByType = {
    error: issues.filter(i => i.severity === 'error').length,
    warning: issues.filter(i => i.severity === 'warning').length,
    info: issues.filter(i => i.severity === 'info').length,
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'error': return 'text-red-400 bg-red-400/10 border-red-400/30'
      case 'warning': return 'text-amber-400 bg-amber-400/10 border-amber-400/30'
      case 'info': return 'text-blue-400 bg-blue-400/10 border-blue-400/30'
      default: return 'text-[var(--text-secondary)] bg-[var(--text-secondary)]/10 border-[var(--text-secondary)]/30'
    }
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'character': return '👤'
      case 'location': return '📍'
      case 'timeline': return '⏰'
      case 'dialogue': return '💬'
      case 'visual': return '👁'
      default: return '❓'
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-[var(--text-secondary)] text-sm sm:text-base">
            Analyze your series for continuity errors, character inconsistencies, and timeline issues.
          </p>
        </div>
        <button
          onClick={analyze}
          disabled={isAnalyzing}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-[var(--bg-tertiary)] disabled:cursor-not-allowed px-4 py-2 rounded font-medium whitespace-nowrap"
        >
          {isAnalyzing ? 'Analyzing...' : hasAnalyzed ? 'Re-analyze' : 'Run Analysis'}
        </button>
      </div>

      {/* Series Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
          <div className="text-2xl font-bold">{sortedIssues.length}</div>
          <div className="text-[var(--text-secondary)] text-sm">Issues</div>
        </div>
        <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
          <div className="text-2xl font-bold">{series.characters.length}</div>
          <div className="text-[var(--text-secondary)] text-sm">Characters</div>
        </div>
        <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
          <div className="text-2xl font-bold">{series.locations.length}</div>
          <div className="text-[var(--text-secondary)] text-sm">Locations</div>
        </div>
        <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
          <div className="text-2xl font-bold">{issues.length}</div>
          <div className="text-[var(--text-secondary)] text-sm">Issues Found</div>
        </div>
      </div>

      {/* Results */}
      {hasAnalyzed && (
        <>
          {/* Summary */}
          <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
            <h3 className="font-medium mb-4">Analysis Summary</h3>
            <div className="flex flex-wrap gap-2 sm:gap-4">
              <button
                onClick={() => setFilter('all')}
                className={`px-3 py-1.5 rounded text-sm ${
                  filter === 'all' ? 'bg-[var(--bg-tertiary)]' : 'bg-[var(--bg-tertiary)] hover:bg-[var(--bg-tertiary)]'
                }`}
              >
                All ({issues.length})
              </button>
              <button
                onClick={() => setFilter('error')}
                className={`px-3 py-1.5 rounded text-sm flex items-center gap-2 ${
                  filter === 'error' ? 'bg-red-600/30 text-red-400' : 'bg-[var(--bg-tertiary)] hover:bg-[var(--bg-tertiary)] text-red-400'
                }`}
              >
                Errors ({issuesByType.error})
              </button>
              <button
                onClick={() => setFilter('warning')}
                className={`px-3 py-1.5 rounded text-sm flex items-center gap-2 ${
                  filter === 'warning' ? 'bg-amber-600/30 text-amber-400' : 'bg-[var(--bg-tertiary)] hover:bg-[var(--bg-tertiary)] text-amber-400'
                }`}
              >
                Warnings ({issuesByType.warning})
              </button>
              <button
                onClick={() => setFilter('info')}
                className={`px-3 py-1.5 rounded text-sm flex items-center gap-2 ${
                  filter === 'info' ? 'bg-blue-600/30 text-blue-400' : 'bg-[var(--bg-tertiary)] hover:bg-[var(--bg-tertiary)] text-blue-400'
                }`}
              >
                Info ({issuesByType.info})
              </button>
            </div>
          </div>

          {/* Issue List */}
          {filteredIssues.length > 0 ? (
            <div className="space-y-4">
              {filteredIssues.map((issue, idx) => (
                <div
                  key={idx}
                  className={`border rounded-lg p-4 ${getSeverityColor(issue.severity)}`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{getTypeIcon(issue.type)}</span>
                      <div>
                        <h4 className="font-medium">{issue.description}</h4>
                        <div className="text-sm opacity-75">
                          Issues: {issue.issueNumbers.map(n => `#${n}`).join(', ')}
                        </div>
                      </div>
                    </div>
                    <span className="text-xs uppercase font-medium px-2 py-1 rounded bg-black/20">
                      {issue.severity}
                    </span>
                  </div>
                  <p className="text-sm opacity-90 mt-2">{issue.details}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg">
              <p className="text-green-400 text-lg font-medium">No issues found!</p>
              <p className="text-[var(--text-secondary)] mt-2">Your series appears to be continuity-clean.</p>
            </div>
          )}
        </>
      )}

      {/* Empty state */}
      {!hasAnalyzed && !isAnalyzing && (
        <div className="text-center py-12 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg">
          <div className="text-5xl mb-4 opacity-30">🔍</div>
          <h3 className="text-lg font-medium text-[var(--text-secondary)] mb-2">Ready to analyze</h3>
          <p className="text-[var(--text-secondary)] text-sm max-w-md mx-auto mb-2">
            Click "Run Analysis" to check your series for continuity issues.
          </p>
          <p className="text-[var(--text-muted)] text-xs max-w-md mx-auto">
            We'll scan character appearances, dialogue consistency, timeline logic, and more.
          </p>
        </div>
      )}

      {/* Loading state */}
      {isAnalyzing && (
        <div className="text-center py-12 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg">
          <div className="animate-pulse">
            <div className="text-4xl mb-4">🔄</div>
            <p className="text-[var(--text-secondary)] font-medium">Analyzing {sortedIssues.length} issues...</p>
            <p className="text-[var(--text-secondary)] text-sm mt-2">Checking characters, locations, timeline, and more</p>
          </div>
        </div>
      )}
    </div>
  )
}
