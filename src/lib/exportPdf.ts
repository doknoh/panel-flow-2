import { jsPDF } from 'jspdf'
import { parseMarkdownForPdf } from './markdown'

interface DialogueBlock {
  character_id: string | null
  speaker_name: string | null
  dialogue_type: string
  modifier: string | null
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

export function exportIssueToPdf(
  issue: Issue,
  options?: {
    authorName?: string
    characterNames?: string[]
  }
) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'letter',
  })

  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 72 // 1 inch margins
  const contentWidth = pageWidth - (margin * 2)
  let y = margin

  const characterMap = new Map(issue.series.characters.map(c => [c.id, c.name]))
  const charNames = options?.characterNames || issue.series.characters.map(c => c.name)

  const addText = (text: string, fontSize: number, isBold = false, indent = 0) => {
    doc.setFontSize(fontSize)
    doc.setFont('helvetica', isBold ? 'bold' : 'normal')

    const lines = doc.splitTextToSize(text, contentWidth - indent)

    for (const line of lines) {
      if (y > doc.internal.pageSize.getHeight() - margin) {
        doc.addPage()
        y = margin
      }
      doc.text(line, margin + indent, y)
      y += fontSize * 1.4
    }
  }

  /**
   * Render text with markdown bold/italic support
   * Parses **bold** and *italic* and renders with appropriate styling
   */
  const addMarkdownText = (text: string, fontSize: number, indent = 0) => {
    if (!text || !text.trim()) return

    doc.setFontSize(fontSize)

    // Parse markdown into styled segments
    let segments = parseMarkdownForPdf(text)

    // Filter out empty segments to prevent tracking issues
    segments = segments.filter(s => s.text && s.text.length > 0)

    // If no valid segments, fall back to plain text rendering
    if (segments.length === 0) {
      addText(text, fontSize, false, indent)
      return
    }

    // For simplicity, we'll render line by line with mixed styles
    // jsPDF doesn't support inline style changes easily, so we need to
    // calculate positions manually for each segment on each line

    // First, split the entire text to determine lines (using plain text)
    const plainText = segments.map(s => s.text).join('')
    // Use slightly reduced width to account for bold text being wider
    const adjustedWidth = (contentWidth - indent) * 0.95
    const lines = doc.splitTextToSize(plainText, adjustedWidth)

    // Track which segment we're in
    let segmentIndex = 0
    let charInSegment = 0

    for (const line of lines) {
      if (y > doc.internal.pageSize.getHeight() - margin) {
        doc.addPage()
        y = margin
      }

      // Render each character/segment of this line
      let x = margin + indent
      let lineCharIndex = 0

      while (lineCharIndex < line.length && segmentIndex < segments.length) {
        const segment = segments[segmentIndex]
        const remainingInSegment = segment.text.length - charInSegment

        // How many chars of this segment are in this line?
        const charsToRender = Math.min(remainingInSegment, line.length - lineCharIndex)
        const textToRender = segment.text.slice(charInSegment, charInSegment + charsToRender)

        // Set font style based on segment
        // Note: jsPDF doesn't support 'bolditalic', so we use bold as fallback
        // Bold is more visually distinct than italic for letterer emphasis
        if (segment.style.bold && segment.style.italic) {
          doc.setFont('helvetica', 'bold') // bolditalic not supported, use bold
        } else if (segment.style.bold) {
          doc.setFont('helvetica', 'bold')
        } else if (segment.style.italic) {
          doc.setFont('helvetica', 'italic')
        } else {
          doc.setFont('helvetica', 'normal')
        }

        // Render this portion
        doc.text(textToRender, x, y)

        // Move x position for next segment
        x += doc.getTextWidth(textToRender)

        // Update tracking
        lineCharIndex += charsToRender
        charInSegment += charsToRender

        // If we've exhausted this segment, move to next
        if (charInSegment >= segment.text.length) {
          segmentIndex++
          charInSegment = 0
        }
      }

      y += fontSize * 1.4
    }
  }

  const addSpace = (pts: number) => {
    y += pts
    if (y > doc.internal.pageSize.getHeight() - margin) {
      doc.addPage()
      y = margin
    }
  }

  // Title page - spec format: "[SERIES TITLE] - ISSUE #[NUMBER]"
  doc.setFontSize(24)
  doc.setFont('helvetica', 'bold')
  doc.text(`${issue.series.title} - ISSUE #${issue.number}`, pageWidth / 2, 200, { align: 'center' })

  // Author line - spec format: "By [Author Name]"
  const authorName = options?.authorName
  if (authorName) {
    doc.setFontSize(14)
    doc.setFont('helvetica', 'normal')
    doc.text(`By ${authorName}`, pageWidth / 2, 230, { align: 'center' })
  }

  // Chapter line - spec format: "CHAPTER [NUMBER]: [ISSUE TITLE]"
  if (issue.title) {
    doc.setFontSize(18)
    doc.setFont('helvetica', 'bold')
    doc.text(`CHAPTER ${issue.number}: ${issue.title.toUpperCase()}`, pageWidth / 2, 260, { align: 'center' })
  }

  // Summary - spec format: "TL;DR SUMMARY" heading
  if (issue.summary) {
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('TL;DR SUMMARY', pageWidth / 2, 310, { align: 'center' })

    doc.setFontSize(12)
    doc.setFont('helvetica', 'normal')
    const summaryLines = doc.splitTextToSize(issue.summary, contentWidth)
    let summaryY = 340
    for (const line of summaryLines) {
      doc.text(line, pageWidth / 2, summaryY, { align: 'center' })
      summaryY += 18
    }
  }

  // Start content
  doc.addPage()
  y = margin

  // Sort acts
  const sortedActs = [...(issue.acts || [])].sort((a, b) => a.sort_order - b.sort_order)

  for (const act of sortedActs) {
    // Act header
    addText(act.name || `ACT ${act.number}`, 16, true)
    addSpace(12)

    // Sort scenes
    const sortedScenes = [...(act.scenes || [])].sort((a, b) => a.sort_order - b.sort_order)

    for (const scene of sortedScenes) {
      // Scene header
      if (scene.title) {
        addText(scene.title.toUpperCase(), 12, true)
        addSpace(8)
      }

      // Sort pages
      const sortedPages = [...(scene.pages || [])].sort((a, b) => a.page_number - b.page_number)

      for (const page of sortedPages) {
        // Determine page orientation (odd = right, even = left)
        const orientation = page.page_number % 2 === 1 ? 'right' : 'left'

        // Page header - spec format: "PAGE [N] ([orientation])"
        addText(`PAGE ${page.page_number} (${orientation})`, 12, true)
        addSpace(8)

        // Sort panels and restart panel numbering at 1 per page
        const sortedPanels = [...(page.panels || [])].sort((a, b) => a.panel_number - b.panel_number)

        sortedPanels.forEach((panel, panelIndex) => {
          // Panel numbers restart at 1 per page per spec
          const displayPanelNumber = panelIndex + 1

          // Panel header with shot type
          const shotType = panel.shot_type ? ` (${panel.shot_type.replace('_', ' ').toUpperCase()})` : ''
          addText(`PANEL ${displayPanelNumber}:${shotType}`, 11, true, 20)

          // Visual description with auto-capitalized character names (supports markdown bold/italic)
          if (panel.visual_description) {
            const capitalizedDesc = autoCapitalizeCharacterNames(panel.visual_description, charNames)
            addMarkdownText(capitalizedDesc, 10, 40)
          }

          addSpace(6)

          // Captions first (they usually appear at top of panel)
          const sortedCaptions = [...(panel.captions || [])].sort((a, b) => a.sort_order - b.sort_order)
          for (const caption of sortedCaptions) {
            const captionType = caption.caption_type === 'narrative' ? 'CAP' :
              caption.caption_type === 'location' ? 'LOCATION' :
              caption.caption_type === 'time' ? 'TIME' :
              'CAP'
            addText(`${captionType}:`, 10, true, 40)
            // Caption text supports markdown bold/italic
            addMarkdownText(caption.text, 10, 60)
            addSpace(4)
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
            if (dialogue.modifier && dialogue.dialogue_type === 'dialogue') {
              modifierSuffix = ` [${dialogue.modifier.toUpperCase()}]`
            }

            addText(`${characterName}${dialogueSuffix}${modifierSuffix}:`, 10, true, 40)
            // Dialogue text supports markdown bold/italic for letterer
            addMarkdownText(dialogue.text, 10, 60)
            addSpace(4)
          }

          // Sound effects (supports markdown bold/italic)
          const sortedSfx = [...(panel.sound_effects || [])].sort((a, b) => a.sort_order - b.sort_order)
          for (const sfx of sortedSfx) {
            if (sfx.text) {
              // SFX label + text with markdown support
              addMarkdownText(`SFX: **${sfx.text.toUpperCase()}**`, 10, 40)
              addSpace(4)
            }
          }

          addSpace(12)
        })

        addSpace(16)
      }
    }

    addSpace(24)
  }

  // End of issue - spec format: "END OF ISSUE #[NUMBER]"
  addText(`END OF ISSUE #${issue.number}`, 14, true)

  // Save the PDF
  const filename = `${issue.series.title.replace(/[^a-z0-9]/gi, '_')}_Issue_${issue.number}.pdf`
  doc.save(filename)
}
