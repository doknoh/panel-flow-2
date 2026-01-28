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

interface Scene {
  id: string
  title: string | null
  sort_order: number
  pages?: { id: string }[]
}

interface Act {
  id: string
  name: string | null
  sort_order: number
  scenes?: Scene[]
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
  acts?: Act[]
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
  characters: string[] // Characters appearing in this panel (from visual description)
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

interface DetectedSpeaker {
  name: string
  count: number // Total appearances (dialogue + visual)
  dialogueCount?: number // How many lines of dialogue
  appearanceCount?: number // How many panel appearances (from visual descriptions)
  mapping: 'new' | 'existing' | 'skip' // new character, existing character, or skip (not a character)
  existingCharacterId?: string // If mapping to existing character
  linkToDetected?: string // If linking to another detected character (format: "detected:NAME")
}

export default function ImportScript({ issue, seriesId }: ImportScriptProps) {
  const [scriptText, setScriptText] = useState('')
  const [isParsing, setIsParsing] = useState(false)
  const [parsedPages, setParsedPages] = useState<ParsedPage[]>([])
  const [parseError, setParseError] = useState<string | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(0)
  const [totalPagesToProcess, setTotalPagesToProcess] = useState(0)
  const [currentParsingPage, setCurrentParsingPage] = useState(0)
  const [detectedSpeakers, setDetectedSpeakers] = useState<DetectedSpeaker[]>([])
  const [showCharacterReview, setShowCharacterReview] = useState(false)
  const [targetSceneId, setTargetSceneId] = useState<string | null>(null)
  const { showToast } = useToast()
  const router = useRouter()

  // Debug: Log what acts data we received
  console.log('ImportScript received issue.acts:', issue.acts)
  console.log('Acts count:', issue.acts?.length || 0)

  // Get all scenes flattened with their parent act info for the dropdown
  const allScenes = (issue.acts || [])
    .sort((a, b) => a.sort_order - b.sort_order)
    .flatMap(act =>
      (act.scenes || [])
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(scene => ({
          ...scene,
          actName: act.name || `Act ${act.sort_order}`,
          actId: act.id,
        }))
    )

  // Find the selected scene for display
  const selectedScene = targetSceneId
    ? allScenes.find(s => s.id === targetSceneId)
    : null

  // Split script into individual pages based on page markers
  const splitScriptByPages = (script: string): { pageNum: number; content: string }[] => {
    // Match patterns like "PAGE 1", "PAGE ONE", "Page 1:", "PAGE 1.", etc.
    const pagePattern = /^[\s]*PAGE[\s]+(\d+|ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN|ELEVEN|TWELVE|THIRTEEN|FOURTEEN|FIFTEEN|SIXTEEN|SEVENTEEN|EIGHTEEN|NINETEEN|TWENTY|\d+)[:\.\s]*$/gim

    const pages: { pageNum: number; content: string }[] = []
    const lines = script.split('\n')
    let currentPage: { pageNum: number; lines: string[] } | null = null

    const wordToNum: Record<string, number> = {
      'ONE': 1, 'TWO': 2, 'THREE': 3, 'FOUR': 4, 'FIVE': 5,
      'SIX': 6, 'SEVEN': 7, 'EIGHT': 8, 'NINE': 9, 'TEN': 10,
      'ELEVEN': 11, 'TWELVE': 12, 'THIRTEEN': 13, 'FOURTEEN': 14, 'FIFTEEN': 15,
      'SIXTEEN': 16, 'SEVENTEEN': 17, 'EIGHTEEN': 18, 'NINETEEN': 19, 'TWENTY': 20
    }

    for (const line of lines) {
      // Match "PAGE 1 (right)", "PAGE 2 (left)", "PAGE 1", "PAGE ONE", etc.
      const match = line.match(/^PAGE\s+(\d+)/i)

      if (match) {
        // Save previous page if exists
        if (currentPage) {
          pages.push({ pageNum: currentPage.pageNum, content: currentPage.lines.join('\n') })
        }
        // Start new page
        const numStr = match[1].toUpperCase()
        const pageNum = wordToNum[numStr] || parseInt(numStr)
        currentPage = { pageNum, lines: [line] }
      } else if (currentPage) {
        currentPage.lines.push(line)
      }
    }

    // Don't forget the last page
    if (currentPage) {
      pages.push({ pageNum: currentPage.pageNum, content: currentPage.lines.join('\n') })
    }

    return pages
  }

  // Parse a single page
  const parseSinglePage = async (pageContent: string, pageNum: number): Promise<ParsedPage | null> => {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `Parse this single comic book page into JSON. Extract panels, visual descriptions, dialogue, captions, sound effects, AND character names that appear in each panel.

Return ONLY a JSON object (no markdown, no explanation) in this exact format:
{
  "number": ${pageNum},
  "orientation": "${pageNum % 2 === 1 ? 'right' : 'left'}",
  "panels": [
    {
      "number": 1,
      "visualDescription": "Description of what we see",
      "characters": ["CHARACTER1", "CHARACTER2"],
      "dialogue": [
        { "speaker": "CHARACTER NAME", "type": "standard", "text": "What they say" }
      ],
      "captions": [
        { "type": "narration", "text": "Caption text" }
      ],
      "sfx": ["CRASH!"]
    }
  ]
}

IMPORTANT: The "characters" array should include ALL character names mentioned in the visual description, even if they don't have dialogue. Look for proper names (capitalized words that are people/characters). This helps track which characters appear in each scene.

Dialogue types: standard, vo, os, whisper, thought
Caption types: narration, location, time

Page content:
${pageContent}`,
        context: { pageNumber: pageNum },
        maxTokens: 2048,
      }),
    })

    if (!response.ok) return null

    const data = await response.json()
    let jsonStr = data.response || data.message

    if (!jsonStr) return null

    // Clean up response
    jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

    // Find JSON object
    const startIdx = jsonStr.indexOf('{')
    const endIdx = jsonStr.lastIndexOf('}')
    if (startIdx === -1 || endIdx === -1) return null

    jsonStr = jsonStr.slice(startIdx, endIdx + 1)

    try {
      return JSON.parse(jsonStr) as ParsedPage
    } catch {
      console.error(`Failed to parse page ${pageNum}:`, jsonStr.slice(0, 200))
      return null
    }
  }

  const parseScript = async () => {
    if (!scriptText.trim()) {
      showToast('Please paste your script first', 'error')
      return
    }

    setIsParsing(true)
    setParseError(null)
    setParsedPages([])
    setTotalPagesToProcess(0)
    setCurrentParsingPage(0)

    try {
      // Split script into pages
      const scriptPages = splitScriptByPages(scriptText)

      if (scriptPages.length === 0) {
        throw new Error('Could not find any pages in script. Make sure pages are marked with "PAGE 1", "PAGE 2", etc.')
      }

      setTotalPagesToProcess(scriptPages.length)
      showToast(`Found ${scriptPages.length} pages, parsing...`, 'success')

      const parsed: ParsedPage[] = []

      // Parse each page individually
      for (let i = 0; i < scriptPages.length; i++) {
        const { pageNum, content } = scriptPages[i]
        setCurrentParsingPage(i + 1)
        setImportProgress(Math.round(((i + 1) / scriptPages.length) * 100))

        const result = await parseSinglePage(content, pageNum)
        if (result) {
          parsed.push(result)
          // Update UI as we go
          setParsedPages([...parsed])
        } else {
          console.warn(`Failed to parse page ${pageNum}, skipping`)
        }
      }

      if (parsed.length === 0) {
        throw new Error('Failed to parse any pages')
      }

      // Sort by page number
      parsed.sort((a, b) => a.number - b.number)
      setParsedPages(parsed)
      setTotalPagesToProcess(0) // Reset to indicate parsing complete

      // Detect all characters (from dialogue AND visual descriptions)
      const characterCounts = new Map<string, { dialogue: number; appearances: number }>()

      for (const page of parsed) {
        for (const panel of page.panels) {
          // Count dialogue speakers
          for (const dialogue of panel.dialogue) {
            if (dialogue.speaker && dialogue.speaker.trim()) {
              const name = dialogue.speaker.trim()
              const existing = characterCounts.get(name) || { dialogue: 0, appearances: 0 }
              characterCounts.set(name, { ...existing, dialogue: existing.dialogue + 1 })
            }
          }

          // Count characters from visual descriptions
          if (panel.characters && Array.isArray(panel.characters)) {
            for (const charName of panel.characters) {
              if (charName && charName.trim()) {
                const name = charName.trim()
                const existing = characterCounts.get(name) || { dialogue: 0, appearances: 0 }
                characterCounts.set(name, { ...existing, appearances: existing.appearances + 1 })
              }
            }
          }
        }
      }

      // Build existing character map for matching
      const existingCharacters = new Map(
        issue.series.characters.map(c => [c.name.toLowerCase(), c.id])
      )

      // Create detected characters list
      const speakers: DetectedSpeaker[] = []
      for (const [name, counts] of characterCounts) {
        const existingId = existingCharacters.get(name.toLowerCase())
        const totalCount = counts.dialogue + counts.appearances
        speakers.push({
          name,
          count: totalCount,
          dialogueCount: counts.dialogue,
          appearanceCount: counts.appearances,
          mapping: existingId ? 'existing' : 'new',
          existingCharacterId: existingId,
        })
      }

      // Sort by total appearances (most frequent first)
      speakers.sort((a, b) => b.count - a.count)
      setDetectedSpeakers(speakers)

      // Show character review if there are any speakers
      if (speakers.length > 0) {
        setShowCharacterReview(true)
        showToast(`Parsed ${parsed.length} pages. Please review ${speakers.length} detected characters.`, 'success')
      } else {
        showToast(`Successfully parsed ${parsed.length} pages. Ready to import!`, 'success')
      }
    } catch (error) {
      console.error('Parse error:', error)
      setParseError(error instanceof Error ? error.message : 'Failed to parse script')
      showToast('Failed to parse script', 'error')
    } finally {
      setIsParsing(false)
    }
  }

  const importParsedScript = async () => {
    console.log('=== IMPORT STARTED ===')
    console.log(`parsedPages.length = ${parsedPages.length}`)
    console.log('parsedPages:', parsedPages.map(p => ({ number: p.number, panels: p.panels.length })))
    console.log('targetSceneId:', targetSceneId)

    if (parsedPages.length === 0) {
      console.log('No pages to import, returning early')
      return
    }

    // Different confirmation based on import mode
    if (targetSceneId) {
      // Targeted import - append to specific scene
      const sceneName = selectedScene?.title || 'selected scene'
      const actName = selectedScene?.actName || 'act'
      const confirmed = window.confirm(
        `Import ${parsedPages.length} pages into "${sceneName}" (${actName})?\n\n` +
        `This will add ${parsedPages.reduce((sum, p) => sum + p.panels.length, 0)} panels to this scene.\n` +
        `Existing pages in this scene will be preserved.`
      )
      if (!confirmed) return
    } else {
      // Replace all - original behavior
      const hasExistingContent = issue.acts && issue.acts.length > 0
      if (hasExistingContent) {
        const confirmed = window.confirm(
          `This will REPLACE ALL existing content in Issue #${issue.number}.\n\n` +
          `You are about to import ${parsedPages.length} pages with ${parsedPages.reduce((sum, p) => sum + p.panels.length, 0)} panels.\n\n` +
          `All existing acts, scenes, and pages will be deleted.\n` +
          `This action cannot be undone. Continue?`
        )
        if (!confirmed) return
      }
    }

    setIsImporting(true)
    setImportProgress(0)

    const supabase = createClient()

    try {
      let sceneId: string

      if (targetSceneId) {
        // TARGETED IMPORT - use existing scene
        sceneId = targetSceneId
        console.log(`Targeted import to scene: ${sceneId}`)
      } else {
        // REPLACE ALL - delete everything and create fresh structure
        console.log('Replace all mode - deleting existing content')

        // Clear existing content - delete all acts (cascades to scenes, pages, panels, etc.)
        await supabase
          .from('acts')
          .delete()
          .eq('issue_id', issue.id)

        // Create a fresh act
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

        // Create a scene for the imported content
        const { data: newScene, error: sceneError } = await supabase
          .from('scenes')
          .insert({
            act_id: newAct.id,
            title: 'Main',
            sort_order: 1,
          })
          .select()
          .single()

        if (sceneError) throw sceneError
        sceneId = newScene.id
      }

      // Get existing page count in target scene for sort_order calculation
      const existingPagesInScene = targetSceneId
        ? (selectedScene?.pages?.length || 0)
        : 0

      // Build character name to ID map from existing characters
      const characterMap = new Map<string, string>(
        issue.series.characters.map(c => [c.name.toLowerCase(), c.id])
      )

      // Process detected speakers based on user's choices
      // First pass: create new characters
      const speakersToCreate = detectedSpeakers.filter(s => s.mapping === 'new')
      console.log(`Creating ${speakersToCreate.length} new characters:`, speakersToCreate.map(s => s.name))

      let createdCount = 0
      let failedCount = 0

      for (const speaker of speakersToCreate) {
        console.log(`Attempting to create character: "${speaker.name}" for series ${issue.series.id}`)

        const { data: newChar, error: charError } = await supabase
          .from('characters')
          .insert({
            series_id: issue.series.id,
            name: speaker.name,
          })
          .select()
          .single()

        if (charError) {
          console.error(`Failed to create character "${speaker.name}":`, charError)
          showToast(`Failed to create character "${speaker.name}": ${charError.message || 'Unknown error'}`, 'error')
          failedCount++
        } else if (newChar) {
          characterMap.set(speaker.name.toLowerCase(), newChar.id)
          console.log(`Created character "${speaker.name}" with id ${newChar.id}`)
          createdCount++
        }
      }

      // Second pass: map existing and linked characters
      for (const speaker of detectedSpeakers) {
        if (speaker.mapping === 'existing') {
          if (speaker.linkToDetected) {
            // Linked to another detected character
            const linkedName = speaker.linkToDetected.replace('detected:', '')
            const linkedId = characterMap.get(linkedName.toLowerCase())
            if (linkedId) {
              characterMap.set(speaker.name.toLowerCase(), linkedId)
              console.log(`Linked "${speaker.name}" to "${linkedName}" (id: ${linkedId})`)
            } else {
              console.warn(`Could not link "${speaker.name}" to "${linkedName}" - character not found`)
            }
          } else if (speaker.existingCharacterId) {
            // Map to existing database character
            characterMap.set(speaker.name.toLowerCase(), speaker.existingCharacterId)
            console.log(`Mapped "${speaker.name}" to existing character ${speaker.existingCharacterId}`)
          }
        }
        // If 'skip', don't add to map - dialogue will have null character_id
      }

      if (createdCount > 0) {
        showToast(`Created ${createdCount} new character(s)`, 'success')
      }
      if (failedCount > 0) {
        showToast(`Failed to create ${failedCount} character(s) - check console for details`, 'error')
      }

      // Import pages
      console.log(`Starting import of ${parsedPages.length} pages into scene ${sceneId}`)
      console.log(`Existing pages in scene: ${existingPagesInScene}`)
      for (let i = 0; i < parsedPages.length; i++) {
        const parsedPage = parsedPages[i]
        setImportProgress(Math.round(((i + 1) / parsedPages.length) * 100))
        console.log(`Importing page ${i + 1}/${parsedPages.length}: page number ${parsedPage.number}`)

        // Create page
        // page_number is the label (from script), sort_order determines position in scene
        const { data: page, error: pageError } = await supabase
          .from('pages')
          .insert({
            scene_id: sceneId,
            page_number: parsedPage.number,
            sort_order: existingPagesInScene + i + 1,
          })
          .select()
          .single()

        if (pageError) {
          console.error(`Error creating page ${parsedPage.number}:`, pageError)
          throw pageError
        }
        console.log(`Created page ${page.id} with page_number ${page.page_number}`)

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

          console.log(`Created panel ${panel.id} for page ${page.page_number}, panel ${parsedPanel.number}`)

          // Create dialogue blocks
          for (let j = 0; j < parsedPanel.dialogue.length; j++) {
            const dialogue = parsedPanel.dialogue[j]
            const characterId = characterMap.get(dialogue.speaker.toLowerCase()) || null

            // Map script dialogue types to valid database values
            // Valid types: dialogue, thought, whisper, shout, radio, electronic
            const dialogueType =
              dialogue.type === 'vo' ? 'radio' :
              dialogue.type === 'os' ? 'dialogue' :
              dialogue.type === 'whisper' ? 'whisper' :
              dialogue.type === 'thought' ? 'thought' :
              'dialogue'

            // Try inserting with dialogue_type, fall back without it if column doesn't exist
            const dialogueData = {
              panel_id: panel.id,
              character_id: characterId,
              dialogue_type: dialogueType,
              text: dialogue.text,
              sort_order: j + 1,
            }

            let dialogueResult = await supabase.from('dialogue_blocks').insert(dialogueData)

            // If dialogue_type column doesn't exist, retry without it
            if (dialogueResult.error?.message?.includes('dialogue_type')) {
              console.warn('dialogue_type column not found, inserting without it')
              const { dialogue_type, ...dataWithoutType } = dialogueData
              dialogueResult = await supabase.from('dialogue_blocks').insert(dataWithoutType)
            }

            if (dialogueResult.error) {
              const err = dialogueResult.error
              console.error('Error inserting dialogue:', {
                message: err.message,
                code: err.code,
                details: err.details,
                hint: err.hint,
                raw: err,
              })
              console.error('Attempted to insert:', dialogueData)
            } else {
              console.log(`Inserted dialogue for panel ${panel.id}: "${dialogue.text?.slice(0, 30)}..."`)
            }
          }

          // Create captions
          for (let j = 0; j < parsedPanel.captions.length; j++) {
            const caption = parsedPanel.captions[j]
            const { error: captionError } = await supabase.from('captions').insert({
              panel_id: panel.id,
              caption_type: caption.type === 'location' ? 'location' :
                           caption.type === 'time' ? 'time' : 'narrative',
              text: caption.text,
              sort_order: j + 1,
            })

            if (captionError) {
              console.error('Error inserting caption:', captionError)
            }
          }

          // Create sound effects
          for (let j = 0; j < parsedPanel.sfx.length; j++) {
            const { error: sfxError } = await supabase.from('sound_effects').insert({
              panel_id: panel.id,
              text: parsedPanel.sfx[j],
              sort_order: j + 1,
            })

            if (sfxError) {
              console.error('Error inserting sound effect:', sfxError)
            }
          }
        }
      }

      console.log('=== IMPORT COMPLETED SUCCESSFULLY ===')
      showToast(`Successfully imported ${parsedPages.length} pages`, 'success')
      router.push(`/series/${seriesId}/issues/${issue.id}`)
    } catch (error) {
      console.error('=== IMPORT ERROR ===')
      console.error('Import error:', error)
      console.error('Error type:', typeof error)
      console.error('Error message:', error instanceof Error ? error.message : String(error))
      showToast('Failed to import script', 'error')
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Instructions */}
      <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-6">
        <div className="flex items-start gap-4">
          <div className="text-4xl opacity-50">📋</div>
          <div className="flex-1">
            <h2 className="font-semibold text-lg mb-2">Import from Google Docs</h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              Copy your comic script from Google Docs and paste it below. The AI will intelligently parse it into structured pages, panels, dialogue, captions, and sound effects.
            </p>
            <details className="text-sm text-[var(--text-secondary)]">
              <summary className="cursor-pointer hover:text-[var(--text-secondary)] mb-2">View supported formats</summary>
              <div className="bg-[var(--bg-tertiary)]/50 rounded-lg p-3 mt-2 font-mono text-xs space-y-1">
                <p className="text-[var(--text-secondary)]">PAGE 1 (right)</p>
                <p className="text-[var(--text-secondary)]">PANEL 1: Description of what we see</p>
                <p className="text-blue-400">CHARACTER: Dialogue text</p>
                <p className="text-blue-400">CHARACTER (V.O.): Voice over narration</p>
                <p className="text-amber-400">CAP: Caption or narration text</p>
                <p className="text-green-400">SFX: CRASH! BANG!</p>
              </div>
            </details>
          </div>
        </div>
        {/* Target Scene Selector */}
        {allScenes.length > 0 && (
          <div className="mt-4 p-4 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-lg">
            <label className="block text-sm font-medium mb-2">Import destination:</label>
            <select
              value={targetSceneId || ''}
              onChange={(e) => setTargetSceneId(e.target.value || null)}
              className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded px-3 py-2 text-sm"
            >
              <option value="">Replace entire issue (delete all existing content)</option>
              {(issue.acts || [])
                .sort((a, b) => a.sort_order - b.sort_order)
                .map(act => (
                  <optgroup key={act.id} label={act.name || `Act ${act.sort_order}`}>
                    {(act.scenes || [])
                      .sort((a, b) => a.sort_order - b.sort_order)
                      .map(scene => (
                        <option key={scene.id} value={scene.id}>
                          {scene.title || `Scene ${scene.sort_order}`}
                          {scene.pages && scene.pages.length > 0 && ` (${scene.pages.length} pages)`}
                        </option>
                      ))}
                  </optgroup>
                ))}
            </select>

            {/* Contextual warning based on selection */}
            {targetSceneId ? (
              <div className="mt-3 p-2 bg-blue-900/20 border border-blue-800/50 rounded">
                <p className="text-sm text-blue-400">
                  📍 Pages will be added to <strong>{selectedScene?.title || 'selected scene'}</strong> ({selectedScene?.actName}).
                  {selectedScene?.pages && selectedScene.pages.length > 0 && (
                    <> This scene already has {selectedScene.pages.length} page(s).</>
                  )}
                </p>
              </div>
            ) : (
              <div className="mt-3 p-2 bg-amber-900/20 border border-amber-800/50 rounded">
                <p className="text-sm text-amber-400">
                  ⚠️ <strong>Warning:</strong> This will delete ALL existing acts, scenes, and pages in this issue.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Script Input */}
      {parsedPages.length === 0 && (
        <div>
          <label className="block text-sm text-[var(--text-secondary)] mb-2">Paste your script:</label>
          <textarea
            value={scriptText}
            onChange={(e) => setScriptText(e.target.value)}
            placeholder={`PAGE 1 (right)

PANEL 1: Wide establishing shot. Detroit skyline at dawn. The city rises from morning mist, a mix of decay and desperate renewal.

CAP: Detroit. 2027.

PANEL 2: Interior - Recording studio. MARSHALL (55, weathered, tired eyes) sits alone at the mic, hand on headphones.

MARSHALL: Is this what we've become?

SFX: *click* (recorder stopping)

PAGE 2 (left)
...`}
            className="w-full h-96 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-lg px-4 py-3 text-sm font-mono resize-none focus:border-blue-500 focus:outline-none placeholder:text-[var(--text-muted)]"
          />
          <div className="flex items-center justify-between mt-4">
            <span className="text-sm text-[var(--text-secondary)]">
              {scriptText.length.toLocaleString()} characters
            </span>
            <button
              onClick={parseScript}
              disabled={isParsing || !scriptText.trim()}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-[var(--bg-tertiary)] disabled:cursor-not-allowed px-4 py-2 rounded font-medium"
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
          <p className="text-sm text-[var(--text-secondary)]">{parseError}</p>
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

      {/* Parsing Progress */}
      {isParsing && totalPagesToProcess > 0 && (
        <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium text-blue-400">Parsing Script...</h3>
            <span className="text-sm text-blue-300">
              Page {currentParsingPage} of {totalPagesToProcess}
            </span>
          </div>
          <div className="w-full bg-[var(--bg-tertiary)] rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${importProgress}%` }}
            />
          </div>
          <p className="text-sm text-[var(--text-secondary)] mt-2">
            Please wait while all pages are parsed. Do not click Import until parsing is complete.
          </p>
        </div>
      )}

      {/* Character Review */}
      {showCharacterReview && detectedSpeakers.length > 0 && (
        <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold">Review Detected Characters</h3>
              <p className="text-sm text-[var(--text-secondary)]">
                {detectedSpeakers.length} speaker(s) found. Confirm how to handle each one.
              </p>
            </div>
            <button
              onClick={() => setShowCharacterReview(false)}
              className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded font-medium text-sm"
            >
              Done Reviewing
            </button>
          </div>

          <div className="space-y-3 max-h-80 overflow-y-auto">
            {detectedSpeakers.map((speaker, idx) => (
              <div
                key={speaker.name}
                className="bg-[var(--bg-tertiary)] rounded-lg p-3 flex items-center gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{speaker.name}</div>
                  <div className="text-xs text-[var(--text-secondary)]">
                    {speaker.dialogueCount ? `${speaker.dialogueCount} line(s)` : 'No dialogue'}
                    {speaker.appearanceCount ? ` · ${speaker.appearanceCount} panel(s)` : ''}
                  </div>
                </div>

                <select
                  value={speaker.mapping}
                  onChange={(e) => {
                    const newSpeakers = [...detectedSpeakers]
                    newSpeakers[idx] = {
                      ...speaker,
                      mapping: e.target.value as 'new' | 'existing' | 'skip',
                      existingCharacterId: e.target.value === 'existing' ? speaker.existingCharacterId : undefined,
                    }
                    setDetectedSpeakers(newSpeakers)
                  }}
                  className="bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-2 py-1 text-sm"
                >
                  <option value="new">Create New Character</option>
                  <option value="existing">Link to Existing</option>
                  <option value="skip">Skip (Not a Character)</option>
                </select>

                {speaker.mapping === 'existing' && (
                  <select
                    value={speaker.existingCharacterId || speaker.linkToDetected || ''}
                    onChange={(e) => {
                      const newSpeakers = [...detectedSpeakers]
                      // Check if linking to another detected character (starts with "detected:")
                      if (e.target.value.startsWith('detected:')) {
                        newSpeakers[idx] = {
                          ...speaker,
                          existingCharacterId: undefined,
                          linkToDetected: e.target.value,
                        }
                      } else {
                        newSpeakers[idx] = {
                          ...speaker,
                          existingCharacterId: e.target.value || undefined,
                          linkToDetected: undefined,
                        }
                      }
                      setDetectedSpeakers(newSpeakers)
                    }}
                    className="bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-2 py-1 text-sm"
                  >
                    <option value="">Select character...</option>
                    {/* Existing database characters */}
                    {issue.series.characters.length > 0 && (
                      <optgroup label="Existing Characters">
                        {issue.series.characters.map((char) => (
                          <option key={char.id} value={char.id}>
                            {char.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {/* Other detected characters set to "Create New" */}
                    {detectedSpeakers.filter(s => s.mapping === 'new' && s.name !== speaker.name).length > 0 && (
                      <optgroup label="Will Be Created">
                        {detectedSpeakers
                          .filter(s => s.mapping === 'new' && s.name !== speaker.name)
                          .map((s) => (
                            <option key={`detected:${s.name}`} value={`detected:${s.name}`}>
                              {s.name} (new)
                            </option>
                          ))}
                      </optgroup>
                    )}
                  </select>
                )}

                {speaker.mapping === 'new' && (
                  <span className="text-xs text-green-400 bg-green-400/10 px-2 py-1 rounded">
                    Will create
                  </span>
                )}

                {speaker.mapping === 'skip' && (
                  <span className="text-xs text-[var(--text-secondary)] bg-[var(--bg-tertiary)] px-2 py-1 rounded">
                    No character
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Parsed Preview */}
      {parsedPages.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold">Preview ({parsedPages.length} pages)</h3>
              {isParsing && (
                <p className="text-sm text-amber-400">Still parsing... please wait</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setParsedPages([])
                  setScriptText('')
                  setTotalPagesToProcess(0)
                }}
                disabled={isParsing}
                className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-3 py-1.5 disabled:opacity-50"
              >
                Start Over
              </button>
              <button
                onClick={importParsedScript}
                disabled={isImporting || isParsing || showCharacterReview}
                className="bg-green-600 hover:bg-green-700 disabled:bg-[var(--bg-tertiary)] disabled:cursor-not-allowed px-4 py-2 rounded font-medium"
              >
                {isImporting
                  ? `Importing... ${importProgress}%`
                  : isParsing
                    ? 'Parsing...'
                    : showCharacterReview
                      ? 'Review Characters First'
                      : 'Import Script'}
              </button>
            </div>
          </div>

          <div className="space-y-4 max-h-[600px] overflow-y-auto">
            {parsedPages.map((page) => (
              <div
                key={page.number}
                className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg overflow-hidden"
              >
                <div className="px-4 py-2 bg-[var(--bg-tertiary)]/50 border-b border-[var(--border)] flex items-center justify-between">
                  <span className="font-medium">
                    Page {page.number} ({page.orientation})
                  </span>
                  <span className="text-sm text-[var(--text-secondary)]">
                    {page.panels.length} panel{page.panels.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="p-4 space-y-3">
                  {page.panels.map((panel) => (
                    <div key={panel.number} className="border-l-2 border-[var(--border)] pl-3">
                      <div className="text-sm font-medium text-[var(--text-secondary)] mb-1">
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
