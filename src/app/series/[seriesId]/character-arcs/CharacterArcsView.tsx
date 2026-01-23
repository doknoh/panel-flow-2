'use client'

import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/contexts/ToastContext'

interface Character {
  id: string
  name: string
  role: string | null
}

interface CharacterState {
  id: string
  character_id: string
  issue_id: string
  emotional_state: string | null
  emotional_score: number | null
  plot_position: string | null
  key_moments: string | null
  arc_summary: string | null
}

interface Issue {
  id: string
  number: number
  title: string | null
  acts: any[]
}

interface Series {
  id: string
  title: string
  characters: Character[]
  issues: Issue[]
}

interface CharacterArcsViewProps {
  series: Series
  characterStates: CharacterState[]
}

export default function CharacterArcsView({ series, characterStates: initialStates }: CharacterArcsViewProps) {
  const [characterStates, setCharacterStates] = useState(initialStates)
  const [selectedCharacter, setSelectedCharacter] = useState<string | null>(
    series.characters[0]?.id || null
  )
  const [isGenerating, setIsGenerating] = useState(false)
  const { showToast } = useToast()

  const sortedIssues = useMemo(() =>
    [...(series.issues || [])].sort((a, b) => a.number - b.number),
    [series.issues]
  )

  const selectedCharacterData = series.characters.find(c => c.id === selectedCharacter)

  // Get states for selected character
  const statesForCharacter = useMemo(() => {
    if (!selectedCharacter) return []
    return sortedIssues.map(issue => {
      const state = characterStates.find(
        s => s.character_id === selectedCharacter && s.issue_id === issue.id
      )
      return { issue, state }
    })
  }, [selectedCharacter, characterStates, sortedIssues])

  // Generate character states using AI
  const generateStates = async () => {
    if (!selectedCharacter || !selectedCharacterData) return

    setIsGenerating(true)

    try {
      // Collect character appearances across issues
      const appearanceData = sortedIssues.map(issue => {
        const appearances: string[] = []

        for (const act of issue.acts || []) {
          for (const scene of act.scenes || []) {
            for (const page of scene.pages || []) {
              for (const panel of page.panels || []) {
                // Check dialogue
                for (const dialogue of panel.dialogue_blocks || []) {
                  if (dialogue.character_id === selectedCharacter && dialogue.text) {
                    appearances.push(`Page ${page.page_number}: "${dialogue.text.slice(0, 100)}"`)
                  }
                }
                // Check visual description for character name
                if (panel.visual_description?.toLowerCase().includes(selectedCharacterData.name.toLowerCase())) {
                  appearances.push(`Page ${page.page_number}: ${panel.visual_description.slice(0, 100)}`)
                }
              }
            }
          }
        }

        return {
          issueNumber: issue.number,
          issueId: issue.id,
          appearances: appearances.slice(0, 10), // Limit to first 10
        }
      }).filter(d => d.appearances.length > 0)

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Analyze the character arc for "${selectedCharacterData.name}" across these comic book issues.

For each issue where they appear, provide:
1. emotional_state: One word describing their emotional state (e.g., "hopeful", "desperate", "conflicted")
2. emotional_score: Number 1-10 (1=despair/low point, 10=triumph/high point)
3. plot_position: Brief description of their situation (e.g., "in control", "endangered", "searching")
4. arc_summary: One sentence summary of their journey in this issue

Return ONLY valid JSON in this format (no markdown):
{
  "states": [
    {
      "issueNumber": 1,
      "emotional_state": "hopeful",
      "emotional_score": 7,
      "plot_position": "beginning their journey",
      "arc_summary": "Character starts with optimism but faces their first setback."
    }
  ]
}

Character appearances by issue:
${JSON.stringify(appearanceData, null, 2)}`,
          context: {
            characterName: selectedCharacterData.name,
            characterRole: selectedCharacterData.role,
          },
        }),
      })

      if (!response.ok) throw new Error('Failed to generate states')

      const data = await response.json()

      // Parse response
      let jsonStr = data.message
      jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '')

      const startIdx = jsonStr.indexOf('{')
      const endIdx = jsonStr.lastIndexOf('}')
      const parsed = JSON.parse(jsonStr.slice(startIdx, endIdx + 1))

      // Save states to database
      const supabase = createClient()

      for (const state of parsed.states) {
        const issue = sortedIssues.find(i => i.number === state.issueNumber)
        if (!issue) continue

        const existingState = characterStates.find(
          s => s.character_id === selectedCharacter && s.issue_id === issue.id
        )

        if (existingState) {
          // Update existing
          await supabase
            .from('character_states')
            .update({
              emotional_state: state.emotional_state,
              emotional_score: state.emotional_score,
              plot_position: state.plot_position,
              arc_summary: state.arc_summary,
            })
            .eq('id', existingState.id)
        } else {
          // Insert new
          await supabase.from('character_states').insert({
            character_id: selectedCharacter,
            issue_id: issue.id,
            emotional_state: state.emotional_state,
            emotional_score: state.emotional_score,
            plot_position: state.plot_position,
            arc_summary: state.arc_summary,
          })
        }
      }

      // Refresh states
      const { data: newStates } = await supabase
        .from('character_states')
        .select('*')
        .in('character_id', series.characters.map(c => c.id))

      if (newStates) setCharacterStates(newStates)
      showToast('Character arc generated', 'success')
    } catch (error) {
      console.error('Error generating states:', error)
      showToast('Failed to generate character arc', 'error')
    } finally {
      setIsGenerating(false)
    }
  }

  // Calculate arc line data for visualization
  const arcData = statesForCharacter
    .filter(s => s.state?.emotional_score)
    .map(s => ({
      issue: s.issue.number,
      score: s.state!.emotional_score!,
      state: s.state!.emotional_state,
    }))

  return (
    <div className="space-y-6">
      {/* Character Selector */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <label className="text-sm text-zinc-400">Character:</label>
          <select
            value={selectedCharacter || ''}
            onChange={(e) => setSelectedCharacter(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2"
          >
            {series.characters.map((char) => (
              <option key={char.id} value={char.id}>
                {char.name} {char.role && `(${char.role})`}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={generateStates}
          disabled={isGenerating || !selectedCharacter}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:cursor-not-allowed px-4 py-2 rounded font-medium"
        >
          {isGenerating ? 'Analyzing...' : 'Generate Arc with AI'}
        </button>
      </div>

      {/* Arc Visualization */}
      {arcData.length > 1 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
          <h3 className="font-medium mb-4">Emotional Journey</h3>
          <div className="relative h-40">
            {/* Y-axis labels */}
            <div className="absolute left-0 top-0 bottom-0 w-12 flex flex-col justify-between text-xs text-zinc-500">
              <span>High</span>
              <span>Mid</span>
              <span>Low</span>
            </div>

            {/* Chart area */}
            <div className="ml-14 h-full relative">
              {/* Grid lines */}
              <div className="absolute inset-0 flex flex-col justify-between">
                {[0, 1, 2].map(i => (
                  <div key={i} className="border-b border-zinc-800" />
                ))}
              </div>

              {/* Data points and line */}
              <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
                {/* Line connecting points */}
                <polyline
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="2"
                  points={arcData.map((d, i) => {
                    const x = (i / (arcData.length - 1)) * 100
                    const y = 100 - ((d.score - 1) / 9) * 100
                    return `${x}%,${y}%`
                  }).join(' ')}
                />
                {/* Points */}
                {arcData.map((d, i) => {
                  const x = (i / (arcData.length - 1)) * 100
                  const y = 100 - ((d.score - 1) / 9) * 100
                  return (
                    <circle
                      key={i}
                      cx={`${x}%`}
                      cy={`${y}%`}
                      r="6"
                      fill="#3b82f6"
                      className="cursor-pointer hover:fill-blue-400"
                    >
                      <title>Issue #{d.issue}: {d.state} ({d.score}/10)</title>
                    </circle>
                  )
                })}
              </svg>

              {/* X-axis labels */}
              <div className="absolute -bottom-6 left-0 right-0 flex justify-between text-xs text-zinc-500">
                {arcData.map((d, i) => (
                  <span key={i}>#{d.issue}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Per-Issue Breakdown */}
      <div className="space-y-4">
        <h3 className="font-medium">Issue-by-Issue Arc</h3>
        {statesForCharacter.map(({ issue, state }) => (
          <div
            key={issue.id}
            className="bg-zinc-900 border border-zinc-800 rounded-lg p-4"
          >
            <div className="flex items-center justify-between mb-2">
              <div>
                <span className="font-medium">Issue #{issue.number}</span>
                {issue.title && <span className="text-zinc-400 ml-2">{issue.title}</span>}
              </div>
              {state?.emotional_score && (
                <div className={`text-lg font-bold ${
                  state.emotional_score >= 7 ? 'text-green-400' :
                  state.emotional_score >= 4 ? 'text-amber-400' :
                  'text-red-400'
                }`}>
                  {state.emotional_score}/10
                </div>
              )}
            </div>

            {state ? (
              <div className="space-y-2 text-sm">
                <div className="flex gap-4">
                  {state.emotional_state && (
                    <span className="bg-zinc-800 px-2 py-1 rounded">
                      {state.emotional_state}
                    </span>
                  )}
                  {state.plot_position && (
                    <span className="text-zinc-400">{state.plot_position}</span>
                  )}
                </div>
                {state.arc_summary && (
                  <p className="text-zinc-300">{state.arc_summary}</p>
                )}
                {state.key_moments && (
                  <p className="text-zinc-500">Key moments: {state.key_moments}</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-zinc-500 italic">
                No arc data yet. Click "Generate Arc with AI" to analyze.
              </p>
            )}
          </div>
        ))}
      </div>

      {series.characters.length === 0 && (
        <div className="text-center py-12 bg-zinc-900 border border-zinc-800 rounded-lg">
          <p className="text-zinc-400">No characters in this series yet</p>
        </div>
      )}
    </div>
  )
}
