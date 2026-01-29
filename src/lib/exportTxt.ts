interface DialogueBlock {
  character_id: string | null
  dialogue_type: string
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
  shot_type: string | null
  dialogue_blocks: DialogueBlock[]
  captions: Caption[]
  sound_effects: SoundEffect[]
}

interface Page {
  page_number: number
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

export function exportIssueToTxt(issue: Issue) {
  const characterMap = new Map(issue.series.characters.map(c => [c.id, c.name]))
  const lines: string[] = []

  // Title header
  lines.push(issue.series.title.toUpperCase())
  lines.push(`ISSUE #${issue.number}${issue.title ? `: ${issue.title.toUpperCase()}` : ''}`)
  lines.push('')

  // Summary if exists
  if (issue.summary) {
    lines.push('SUMMARY:')
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

        // Page header
        lines.push(`PAGE ${page.page_number} (${orientation})`)
        lines.push('')

        // Sort panels
        const sortedPanels = [...(page.panels || [])].sort((a, b) => a.panel_number - b.panel_number)

        for (const panel of sortedPanels) {
          // Panel header with shot type
          const shotType = panel.shot_type
            ? ` ${panel.shot_type.replace('_', ' ').toUpperCase()}.`
            : ''

          lines.push(`PANEL ${panel.panel_number}:${shotType}`)

          // Visual description
          if (panel.visual_description) {
            lines.push(`    ${panel.visual_description}`)
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

            lines.push(`    ${captionLabel}: "${caption.text}"`)
          }

          // Dialogue blocks
          const sortedDialogue = [...(panel.dialogue_blocks || [])].sort((a, b) => a.sort_order - b.sort_order)
          for (const dialogue of sortedDialogue) {
            const characterName = dialogue.character_id
              ? (characterMap.get(dialogue.character_id) || 'UNKNOWN').toUpperCase()
              : 'UNKNOWN'

            // Build dialogue type suffix
            let dialogueSuffix = ''
            if (dialogue.dialogue_type === 'thought') {
              dialogueSuffix = ' (THINKS)'
            } else if (dialogue.dialogue_type === 'whisper') {
              dialogueSuffix = ' (WHISPERS)'
            } else if (dialogue.dialogue_type === 'shout') {
              dialogueSuffix = ' (SHOUTS)'
            } else if (dialogue.dialogue_type === 'off_panel') {
              dialogueSuffix = ' (O.S.)'
            } else if (dialogue.dialogue_type === 'electronic') {
              dialogueSuffix = ' (ELECTRONIC)'
            }

            lines.push(`    ${characterName}${dialogueSuffix}: "${dialogue.text}"`)
          }

          // Sound effects
          const sortedSfx = [...(panel.sound_effects || [])].sort((a, b) => a.sort_order - b.sort_order)
          for (const sfx of sortedSfx) {
            if (sfx.text) {
              lines.push(`    SFX: ${sfx.text.toUpperCase()}`)
            }
          }

          lines.push('')
        }
      }
    }
  }

  // End marker
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
