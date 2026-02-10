import { jsPDF } from 'jspdf'
import { parseMarkdownForPdf } from './markdown'

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

export function exportIssueToPdf(issue: Issue) {
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

  // Title page
  doc.setFontSize(24)
  doc.setFont('helvetica', 'bold')
  doc.text(issue.series.title, pageWidth / 2, 200, { align: 'center' })

  doc.setFontSize(18)
  doc.text(`Issue #${issue.number}${issue.title ? `: ${issue.title}` : ''}`, pageWidth / 2, 240, { align: 'center' })

  if (issue.summary) {
    doc.setFontSize(12)
    doc.setFont('helvetica', 'normal')
    const summaryLines = doc.splitTextToSize(issue.summary, contentWidth)
    let summaryY = 300
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
        // Page header
        addText(`PAGE ${page.page_number}`, 12, true)
        addSpace(8)

        // Sort panels
        const sortedPanels = [...(page.panels || [])].sort((a, b) => a.panel_number - b.panel_number)

        for (const panel of sortedPanels) {
          // Panel header with shot type
          const shotType = panel.shot_type ? ` (${panel.shot_type.replace('_', ' ').toUpperCase()})` : ''
          addText(`Panel ${panel.panel_number}${shotType}`, 11, true, 20)

          // Visual description (supports markdown bold/italic)
          if (panel.visual_description) {
            addMarkdownText(panel.visual_description, 10, 40)
          }

          addSpace(6)

          // Captions first (they usually appear at top of panel)
          const sortedCaptions = [...(panel.captions || [])].sort((a, b) => a.sort_order - b.sort_order)
          for (const caption of sortedCaptions) {
            const captionType = caption.caption_type.toUpperCase()
            addText(`CAPTION (${captionType}):`, 10, true, 40)
            // Caption text supports markdown bold/italic
            addMarkdownText(`"${caption.text}"`, 10, 60)
            addSpace(4)
          }

          // Dialogue blocks
          const sortedDialogue = [...(panel.dialogue_blocks || [])].sort((a, b) => a.sort_order - b.sort_order)
          for (const dialogue of sortedDialogue) {
            const characterName = dialogue.character_id
              ? characterMap.get(dialogue.character_id) || 'UNKNOWN'
              : 'UNKNOWN'

            const dialogueType = dialogue.dialogue_type !== 'dialogue'
              ? ` (${dialogue.dialogue_type.toUpperCase()})`
              : ''

            addText(`${characterName.toUpperCase()}${dialogueType}:`, 10, true, 40)
            // Dialogue text supports markdown bold/italic for letterer
            addMarkdownText(`"${dialogue.text}"`, 10, 60)
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
        }

        addSpace(16)
      }
    }

    addSpace(24)
  }

  // Save the PDF
  const filename = `${issue.series.title.replace(/[^a-z0-9]/gi, '_')}_Issue_${issue.number}.pdf`
  doc.save(filename)
}
