import { stripMarkdown } from './markdown'

interface DialogueBlock {
  character_id: string | null
  speaker_name: string | null
  dialogue_type: string
  delivery_instruction: string | null
  text: string
  sort_order: number
}

interface Caption {
  caption_type: string
  text: string
  sort_order: number
}

interface SoundEffect {
  text: string
  sort_order: number
}

interface Panel {
  panel_number: number
  visual_description: string | null
  camera: string | null
  notes_to_artist: string | null
  dialogue_blocks: DialogueBlock[]
  captions: Caption[]
  sound_effects: SoundEffect[]
}

interface Page {
  page_number: number
  page_type?: string | null
  linked_page_id?: string | null
  notes_to_artist?: string | null
  panels: Panel[]
}

interface Scene {
  title: string | null
  pages: Page[]
  sort_order: number
}

interface Act {
  name: string | null
  number: number
  scenes: Scene[]
  sort_order: number
}

interface Issue {
  number: number
  title: string | null
  summary: string | null
  series: {
    title: string
    characters: { id: string; name: string }[]
  }
  acts: Act[]
}

/**
 * Build the dialogue type suffix based on the spec format.
 *
 * Mapping:
 *   'dialogue'    -> no suffix (standard)
 *   'voice_over'  -> ' (V.O.)'
 *   'off_panel'   -> ' (O.S.)'
 *   'thought'     -> ' (THINKS)'
 *   'whisper'     -> ' [WHISPERS]'
 *   'shout'       -> ' [SHOUTS]'
 *   'electronic'  -> ' (ELECTRONIC)'
 */
function getDialogueSuffix(dialogueType: string): string {
  switch (dialogueType) {
    case 'voice_over':
    case 'radio':
      return ' (V.O.)'
    case 'off_panel':
      return ' (O.S.)'
    case 'thought':
      return ' (THINKS)'
    case 'whisper':
      return ' [WHISPERS]'
    case 'shout':
      return ' [SHOUTS]'
    case 'electronic':
      return ' (ELECTRONIC)'
    default:
      return ''
  }
}

/**
 * Auto-capitalize character names in visual descriptions.
 * Scans for known character display names and replaces them
 * with their UPPERCASE equivalents.
 */
function autoCapitalizeCharacterNames(text: string, characterNames: string[]): string {
  if (!text || characterNames.length === 0) return text

  let result = text
  for (const name of characterNames) {
    if (!name) continue
    // Match the name as a whole word (case-insensitive), replace with uppercase
    const regex = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi')
    result = result.replace(regex, name.toUpperCase())
  }
  return result
}

export function exportIssueToTxt(
  issue: Issue,
  options?: {
    authorName?: string
    characterNames?: string[]
    includeSummary?: boolean
    includeNotes?: boolean
  }
) {
  const characterMap = new Map(issue.series.characters.map(c => [c.id, c.name]))
  const charNames = options?.characterNames || issue.series.characters.map(c => c.name)
  const lines: string[] = []

  // Title header - spec format: "[SERIES TITLE] - ISSUE #[NUMBER]"
  lines.push(`${issue.series.title.toUpperCase()} - ISSUE #${issue.number}`)

  // Author line - spec format: "By [Author Name]"
  const authorName = options?.authorName
  if (authorName) {
    lines.push(`By ${authorName}`)
  }

  // Chapter line - spec format: "CHAPTER [NUMBER]: [ISSUE TITLE]"
  if (issue.title) {
    lines.push(`CHAPTER ${issue.number}: ${issue.title.toUpperCase()}`)
  }

  lines.push('')

  // Summary - spec format: "TL;DR SUMMARY" heading
  const includeSummary = options?.includeSummary !== false // default true
  if (issue.summary && includeSummary) {
    lines.push('TL;DR SUMMARY')
    lines.push(issue.summary)
    lines.push('')
  }

  lines.push('='.repeat(60))
  lines.push('')

  // Sort acts
  const sortedActs = [...(issue.acts || [])].sort((a, b) => a.sort_order - b.sort_order)

  for (const act of sortedActs) {
    // Act header
    lines.push((act.name || `ACT ${act.number}`).toUpperCase())
    lines.push('-'.repeat(40))
    lines.push('')

    // Sort scenes
    const sortedScenes = [...(act.scenes || [])].sort((a, b) => a.sort_order - b.sort_order)

    for (const scene of sortedScenes) {
      // Scene title if exists
      if (scene.title) {
        lines.push(`[${scene.title.toUpperCase()}]`)
        lines.push('')
      }

      // Sort pages
      const sortedPages = [...(scene.pages || [])].sort((a, b) => a.page_number - b.page_number)

      for (const page of sortedPages) {
        // Determine page orientation (odd = right, even = left)
        const orientation = page.page_number % 2 === 1 ? 'right' : 'left'
        const pageType = page.page_type?.toUpperCase()

        // For SPREAD_RIGHT, render panels without a full page header
        if (pageType === 'SPREAD_RIGHT') {
          const sortedRightPanels = [...(page.panels || [])].sort((a, b) => a.panel_number - b.panel_number)
          if (sortedRightPanels.length > 0) {
            lines.push(`  — Page ${page.page_number} panels —`)
            lines.push('')
          }
          sortedRightPanels.forEach((panel, panelIndex) => {
            const displayPanelNumber = panelIndex + 1
            const shotType = panel.camera ? ` ${panel.camera.replace('_', ' ').toUpperCase()}.` : ''
            lines.push(`PANEL ${displayPanelNumber}:${shotType}`)
            if (panel.visual_description) {
              const capitalizedDesc = autoCapitalizeCharacterNames(panel.visual_description, charNames)
              lines.push(`    ${stripMarkdown(capitalizedDesc)}`)
            }
            lines.push('')
            const sortedCaptions = [...(panel.captions || [])].sort((a, b) => a.sort_order - b.sort_order)
            for (const caption of sortedCaptions) {
              const captionLabel = caption.caption_type === 'narrative' ? 'CAP' : caption.caption_type === 'location' ? 'LOCATION' : caption.caption_type === 'time' ? 'TIME' : caption.caption_type === 'editorial' ? 'EDITORIAL' : 'CAP'
              lines.push(`    ${captionLabel}: ${caption.text}`)
            }
            const sortedDialogue = [...(panel.dialogue_blocks || [])].sort((a, b) => a.sort_order - b.sort_order)
            for (const dialogue of sortedDialogue) {
              const characterName = dialogue.speaker_name ? dialogue.speaker_name.toUpperCase() : dialogue.character_id ? (characterMap.get(dialogue.character_id) || 'UNKNOWN').toUpperCase() : 'UNKNOWN'
              const dialogueSuffix = getDialogueSuffix(dialogue.dialogue_type)
              let modifierSuffix = ''
              if (dialogue.delivery_instruction && dialogue.dialogue_type === 'dialogue') { modifierSuffix = ` [${dialogue.delivery_instruction.toUpperCase()}]` }
              lines.push(`    ${characterName}${dialogueSuffix}${modifierSuffix}: ${dialogue.text}`)
            }
            const sortedSfx = [...(panel.sound_effects || [])].sort((a, b) => a.sort_order - b.sort_order)
            for (const sfx of sortedSfx) {
              if (sfx.text) { lines.push(`    SFX: ${sfx.text.toUpperCase()}`) }
            }
            lines.push('')
          })
          continue
        }

        // Page header - handle spreads vs. single pages
        if (pageType === 'SPREAD_LEFT') {
          const nextPageNum = page.page_number + 1
          lines.push(`PAGES ${page.page_number}-${nextPageNum} (DOUBLE-PAGE SPREAD)`)
        } else if (pageType === 'SPLASH') {
          lines.push(`PAGE ${page.page_number} (${orientation}, SPLASH)`)
        } else {
          lines.push(`PAGE ${page.page_number} (${orientation})`)
        }

        // Artist notes for the page
        if (page.notes_to_artist) {
          lines.push(`    *Note to Artist: ${page.notes_to_artist}*`)
        }

        lines.push('')

        // Sort panels and restart panel numbering at 1 per page
        const sortedPanels = [...(page.panels || [])].sort((a, b) => a.panel_number - b.panel_number)

        sortedPanels.forEach((panel, panelIndex) => {
          // Panel numbers restart at 1 per page per spec
          const displayPanelNumber = panelIndex + 1

          // Panel header - spec format: "PANEL N: [description]"
          const shotType = panel.camera
            ? ` ${panel.camera.replace('_', ' ').toUpperCase()}.`
            : ''

          lines.push(`PANEL ${displayPanelNumber}:${shotType}`)

          // Visual description with auto-capitalized character names
          if (panel.visual_description) {
            const capitalizedDesc = autoCapitalizeCharacterNames(panel.visual_description, charNames)
            lines.push(`    ${stripMarkdown(capitalizedDesc)}`)
          }

          lines.push('')

          // Captions (appear first in panel)
          const sortedCaptions = [...(panel.captions || [])].sort((a, b) => a.sort_order - b.sort_order)
          for (const caption of sortedCaptions) {
            const captionLabel =
              caption.caption_type === 'narrative' ? 'CAP' :
              caption.caption_type === 'location' ? 'LOCATION' :
              caption.caption_type === 'time' ? 'TIME' :
              caption.caption_type === 'editorial' ? 'EDITORIAL' :
              'CAP'

            lines.push(`    ${captionLabel}: ${caption.text}`)
          }

          // Dialogue blocks
          const sortedDialogue = [...(panel.dialogue_blocks || [])].sort((a, b) => a.sort_order - b.sort_order)
          for (const dialogue of sortedDialogue) {
            // Use speaker_name if available, otherwise look up from character map
            const characterName = dialogue.speaker_name
              ? dialogue.speaker_name.toUpperCase()
              : dialogue.character_id
                ? (characterMap.get(dialogue.character_id) || 'UNKNOWN').toUpperCase()
                : 'UNKNOWN'

            // Build dialogue type suffix per spec format
            const dialogueSuffix = getDialogueSuffix(dialogue.dialogue_type)

            // Add modifier/instruction in bracket format if present and type is standard dialogue
            let modifierSuffix = ''
            if (dialogue.delivery_instruction && dialogue.dialogue_type === 'dialogue') {
              modifierSuffix = ` [${dialogue.delivery_instruction.toUpperCase()}]`
            }

            lines.push(`    ${characterName}${dialogueSuffix}${modifierSuffix}: ${dialogue.text}`)
          }

          // Sound effects
          const sortedSfx = [...(panel.sound_effects || [])].sort((a, b) => a.sort_order - b.sort_order)
          for (const sfx of sortedSfx) {
            if (sfx.text) {
              lines.push(`    SFX: ${sfx.text.toUpperCase()}`)
            }
          }

          // Artist notes (optional)
          const includeNotes = options?.includeNotes === true // default false
          if (includeNotes && panel.notes_to_artist) {
            lines.push(`    *Note to Artist: ${panel.notes_to_artist}*`)
          }

          lines.push('')
        })
      }
    }
  }

  // End marker - spec format: "END OF ISSUE #[NUMBER]"
  lines.push('='.repeat(60))
  lines.push(`END OF ISSUE #${issue.number}`)

  // Join all lines and create blob
  const content = lines.join('\n')
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })

  // Create download
  const filename = `${issue.series.title.replace(/[^a-z0-9]/gi, '_')}_Issue_${issue.number}.txt`
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
