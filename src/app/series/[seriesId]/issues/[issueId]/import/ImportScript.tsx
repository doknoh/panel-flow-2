'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/contexts/ToastContext'
import { useRouter } from 'next/navigation'

interface Character {
  id: string
  name: string
}

interface Location {
  id: string
  name: string
}

interface Issue {
  id: string
  number: number
  title: string | null
  series: {
    id: string
    title: string
    characters: Character[]
    locations: Location[]
  }
}

interface ParsedDialogue {
  speaker: string
  type: 'standard' | 'vo' | 'os' | 'whisper' | 'thought'
  text: string
}

interface ParsedCaption {
  type: 'narration' | 'location' | 'time'
  text: string
}

interface ParsedPanel {
  number: number
  visualDescription: string
  dialogue: ParsedDialogue[]
  captions: ParsedCaption[]
  sfx: string[]
}

interface ParsedPage {
  number: number
  orientation: 'left' | 'right'
  panels: ParsedPanel[]
}

interface ImportScriptProps {
  issue: Issue
  seriesId: string
}

export default function ImportScript({ issue, seriesId }: ImportScriptProps) {
  const [scriptText, setScriptText] = useState('')
  const [isParsing, setIsParsing] = useState(false)
  const [parsedPages, setParsedPages] = useState<ParsedPage[]>([])
  const [parseError, setParseError] = useState<string | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(0)
  const { showToast } = useToast()
  const router = useRouter()

  const parseScript = async () => {
    if (!scriptText.trim()) {
      showToast('Please paste your script first', 'error')
      return
    }

    setIsParsing(true)
    setParseError(null)

    try {
      // Send to AI for parsing
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Parse this comic book script into structured JSON. Extract pages, panels, visual descriptions, dialogue (with speaker name and type like V.O., O.S., whisper, thought), captions (narration, location, time), and sound effects.

Return ONLY a JSON array of pages in this exact format (no markdown, no explanation):
[
  {
    "number": 1,
    "orientation": "right",
    "panels": [
      {
        "number": 1,
        "visualDescription": "Description of what we see",
        "dialogue": [
          { "speaker": "CHARACTER NAME", "type": "standard", "text": "What they say" }
        ],
        "captions": [
          { "type": "narration", "text": "Caption text" }
        ],
        "sfx": ["CRASH!", "BANG!"]
      }
    ]
  }
]

Types for dialogue: standard, vo, os, whisper, thought
Types for captions: narration, location, time
Orientation: odd pages are "right", even pages are "left"

Here's the script to parse:

${scriptText}`,
          context: {
            seriesTitle: issue.series.title,
            issueNumber: issue.number,
            characters: issue.series.characters.map(c => c.name),
          },
        }),
      })

      if (!response.ok) throw new Error('Failed to parse script')

      const data = await response.json()

      // Try to extract JSON from the response
      let jsonStr = data.message

      // Remove markdown code blocks if present
      jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '')

      // Find the JSON array
      const startIdx = jsonStr.indexOf('[')
      const endIdx = jsonStr.lastIndexOf(']')

      if (startIdx === -1 || endIdx === -1) {
        throw new Error('Could not find valid JSON in response')
      }

      jsonStr = jsonStr.slice(startIdx, endIdx + 1)

      const parsed = JSON.parse(jsonStr) as ParsedPage[]
      setParsedPages(parsed)
      showToast(`Parsed ${parsed.length} pages`, 'success')
    } catch (error) {
      console.error('Parse error:', error)
      setParseError(error instanceof Error ? error.message : 'Failed to parse script')
      showToast('Failed to parse script', 'error')
    } finally {
      setIsParsing(false)
    }
  }

  const importParsedScript = async () => {
    if (parsedPages.length === 0) return

    setIsImporting(true)
    setImportProgress(0)

    const supabase = createClient()

    try {
      // First, create an act if the issue doesn't have one
      let actId: string

      const { data: existingActs } = await supabase
        .from('acts')
        .select('id')
        .eq('issue_id', issue.id)
        .order('sort_order')
        .limit(1)

      if (existingActs && existingActs.length > 0) {
        actId = existingActs[0].id
      } else {
        const { data: newAct, error: actError } = await supabase
          .from('acts')
          .insert({
            issue_id: issue.id,
            number: 1,
            title: 'Act 1',
            sort_order: 1,
          })
          .select()
          .single()

        if (actError) throw actError
        actId = newAct.id
      }

      // Create a scene for the imported content
      const { data: scene, error: sceneError } = await supabase
        .from('scenes')
        .insert({
          act_id: actId,
          title: 'Imported Script',
          sort_order: 1,
        })
        .select()
        .single()

      if (sceneError) throw sceneError

      // Build character name to ID map
      const characterMap = new Map(
        issue.series.characters.map(c => [c.name.toLowerCase(), c.id])
      )

      // Import pages
      for (let i = 0; i < parsedPages.length; i++) {
        const parsedPage = parsedPages[i]
        setImportProgress(Math.round(((i + 1) / parsedPages.length) * 100))

        // Create page
        const { data: page, error: pageError } = await supabase
          .from('pages')
          .insert({
            scene_id: scene.id,
            page_number: parsedPage.number,
            sort_order: parsedPage.number,
          })
          .select()
          .single()

        if (pageError) throw pageError

        // Create panels
        for (const parsedPanel of parsedPage.panels) {
          const { data: panel, error: panelError } = await supabase
            .from('panels')
            .insert({
              page_id: page.id,
              panel_number: parsedPanel.number,
              sort_order: parsedPanel.number,
              visual_description: parsedPanel.visualDescription,
            })
            .select()
            .single()

          if (panelError) throw panelError

          // Create dialogue blocks
          for (let j = 0; j < parsedPanel.dialogue.length; j++) {
            const dialogue = parsedPanel.dialogue[j]
            const characterId = characterMap.get(dialogue.speaker.toLowerCase()) || null

            const dialogueType =
              dialogue.type === 'vo' ? 'off_panel' :
              dialogue.type === 'os' ? 'off_panel' :
              dialogue.type === 'whisper' ? 'whisper' :
              dialogue.type === 'thought' ? 'thought' :
              'dialogue'

            await supabase.from('dialogue_blocks').insert({
              panel_id: panel.id,
              character_id: characterId,
              dialogue_type: dialogueType,
              text: dialogue.text,
              sort_order: j + 1,
            })
          }

          // Create captions
          for (let j = 0; j < parsedPanel.captions.length; j++) {
            const caption = parsedPanel.captions[j]
            await supabase.from('captions').insert({
              panel_id: panel.id,
              caption_type: caption.type === 'location' ? 'location' :
                           caption.type === 'time' ? 'time' : 'narrative',
              text: caption.text,
              sort_order: j + 1,
            })
          }

          // Create sound effects
          for (let j = 0; j < parsedPanel.sfx.length; j++) {
            await supabase.from('sound_effects').insert({
              panel_id: panel.id,
              text: parsedPanel.sfx[j],
              sort_order: j + 1,
            })
          }
        }
      }

      showToast(`Successfully imported ${parsedPages.length} pages`, 'success')
      router.push(`/series/${seriesId}/issues/${issue.id}`)
    } catch (error) {
      console.error('Import error:', error)
      showToast('Failed to import script', 'error')
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Instructions */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
        <h2 className="font-semibold mb-2">Import from Google Docs</h2>
        <p className="text-sm text-zinc-400 mb-3">
          Paste your comic script text below. The AI will parse it into structured pages, panels, dialogue, and captions.
        </p>
        <div className="text-sm text-zinc-500">
          <p className="mb-1">Supported formats:</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>PAGE 1 (right) or PAGE 1 (left)</li>
            <li>PANEL 1: Description of what we see</li>
            <li>CHARACTER: Dialogue text</li>
            <li>CHARACTER (V.O.): Voice over</li>
            <li>CAP: Caption text</li>
            <li>SFX: Sound effect</li>
          </ul>
        </div>
      </div>

      {/* Script Input */}
      {parsedPages.length === 0 && (
        <div>
          <label className="block text-sm text-zinc-400 mb-2">Paste your script:</label>
          <textarea
            value={scriptText}
            onChange={(e) => setScriptText(e.target.value)}
            placeholder="PAGE 1 (right)&#10;PANEL 1: Wide shot of the city skyline at dawn...&#10;&#10;CAP: Detroit. 2027.&#10;&#10;MARSHALL: Is this what we've become?&#10;..."
            className="w-full h-96 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-sm font-mono resize-none focus:border-blue-500 focus:outline-none"
          />
          <div className="flex items-center justify-between mt-4">
            <span className="text-sm text-zinc-500">
              {scriptText.length.toLocaleString()} characters
            </span>
            <button
              onClick={parseScript}
              disabled={isParsing || !scriptText.trim()}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:cursor-not-allowed px-4 py-2 rounded font-medium"
            >
              {isParsing ? 'Parsing...' : 'Parse Script'}
            </button>
          </div>
        </div>
      )}

      {/* Parse Error */}
      {parseError && (
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-4">
          <h3 className="font-medium text-red-400 mb-1">Parse Error</h3>
          <p className="text-sm text-zinc-400">{parseError}</p>
          <button
            onClick={() => {
              setParseError(null)
              setParsedPages([])
            }}
            className="text-sm text-red-400 hover:text-red-300 mt-2"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Parsed Preview */}
      {parsedPages.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Preview ({parsedPages.length} pages)</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setParsedPages([])
                  setScriptText('')
                }}
                className="text-sm text-zinc-400 hover:text-white px-3 py-1.5"
              >
                Start Over
              </button>
              <button
                onClick={importParsedScript}
                disabled={isImporting}
                className="bg-green-600 hover:bg-green-700 disabled:bg-zinc-700 px-4 py-2 rounded font-medium"
              >
                {isImporting ? `Importing... ${importProgress}%` : 'Import Script'}
              </button>
            </div>
          </div>

          <div className="space-y-4 max-h-[600px] overflow-y-auto">
            {parsedPages.map((page) => (
              <div
                key={page.number}
                className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden"
              >
                <div className="px-4 py-2 bg-zinc-800/50 border-b border-zinc-800 flex items-center justify-between">
                  <span className="font-medium">
                    Page {page.number} ({page.orientation})
                  </span>
                  <span className="text-sm text-zinc-500">
                    {page.panels.length} panel{page.panels.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="p-4 space-y-3">
                  {page.panels.map((panel) => (
                    <div key={panel.number} className="border-l-2 border-zinc-700 pl-3">
                      <div className="text-sm font-medium text-zinc-400 mb-1">
                        Panel {panel.number}
                      </div>
                      {panel.visualDescription && (
                        <p className="text-sm mb-2">{panel.visualDescription}</p>
                      )}
                      {panel.captions.map((caption, i) => (
                        <div key={i} className="text-sm text-amber-400 mb-1">
                          CAP ({caption.type}): {caption.text}
                        </div>
                      ))}
                      {panel.dialogue.map((d, i) => (
                        <div key={i} className="text-sm mb-1">
                          <span className="font-medium text-blue-400">
                            {d.speaker}
                            {d.type !== 'standard' && ` (${d.type.toUpperCase()})`}:
                          </span>{' '}
                          {d.text}
                        </div>
                      ))}
                      {panel.sfx.map((sfx, i) => (
                        <div key={i} className="text-sm text-green-400 font-bold">
                          SFX: {sfx}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
