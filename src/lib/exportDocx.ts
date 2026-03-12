import type { Paragraph as ParagraphType } from 'docx'

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

export async function exportIssueToDocx(
  issue: Issue,
  includeNotes = false,
  options?: {
    authorName?: string
    characterNames?: string[]
    includeSummary?: boolean
  }
) {
  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    HeadingLevel,
    AlignmentType,
    PageBreak,
  } = await import('docx')
  const { saveAs } = await import('file-saver')

  const characterMap = new Map(issue.series.characters.map(c => [c.id, c.name]))
  const charNames = options?.characterNames || issue.series.characters.map(c => c.name)

  const children: ParagraphType[] = []

  // Title - spec format: "[SERIES TITLE] - ISSUE #[NUMBER]"
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `${issue.series.title} - ISSUE #${issue.number}`,
          bold: true,
          size: 32, // 16pt
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    })
  )

  // Author line - spec format: "By [Author Name]"
  const authorName = options?.authorName
  if (authorName) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `By ${authorName}`,
            size: 24, // 12pt
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
      })
    )
  }

  // Chapter line - spec format: "CHAPTER [NUMBER]: [ISSUE TITLE]"
  if (issue.title) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `CHAPTER ${issue.number}: ${issue.title.toUpperCase()}`,
            bold: true,
            size: 28, // 14pt
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
      })
    )
  }

  // Summary - spec format: "TL;DR SUMMARY" heading
  const includeSummary = options?.includeSummary !== false // default true
  if (issue.summary && includeSummary) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: 'TL;DR SUMMARY', bold: true, size: 24 }),
        ],
        spacing: { before: 200, after: 100 },
      })
    )
    children.push(
      new Paragraph({
        children: [new TextRun({ text: issue.summary, size: 22 })],
        spacing: { after: 400 },
      })
    )
  }

  // Page break before content
  children.push(new Paragraph({ children: [new PageBreak()] }))

  // Sort acts
  const sortedActs = [...(issue.acts || [])].sort((a, b) => a.sort_order - b.sort_order)

  for (const act of sortedActs) {
    // Act header
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: act.name || `ACT ${act.number}`,
            bold: true,
            size: 28,
            allCaps: true,
          }),
        ],
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 },
      })
    )

    // Sort scenes
    const sortedScenes = [...(act.scenes || [])].sort((a, b) => a.sort_order - b.sort_order)

    for (const scene of sortedScenes) {
      // Scene title if exists
      if (scene.title) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: scene.title.toUpperCase(),
                bold: true,
                size: 24,
              }),
            ],
            spacing: { before: 200, after: 100 },
          })
        )
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
            children.push(new Paragraph({
              children: [new TextRun({ text: `— Page ${page.page_number} panels —`, size: 18, italics: true, color: '666666' })],
              spacing: { before: 100, after: 50 },
              indent: { left: 360 },
            }))
          }
          sortedRightPanels.forEach((panel, panelIndex) => {
            const displayPanelNumber = panelIndex + 1
            const shotType = panel.camera ? ` ${panel.camera.replace('_', ' ').toUpperCase()}.` : ''
            children.push(new Paragraph({
              children: [new TextRun({ text: `PANEL ${displayPanelNumber}:`, bold: true, size: 22 }), new TextRun({ text: shotType, size: 22 })],
              spacing: { before: 150 },
            }))
            if (panel.visual_description) {
              const capitalizedDesc = autoCapitalizeCharacterNames(panel.visual_description, charNames)
              children.push(new Paragraph({ children: [new TextRun({ text: capitalizedDesc, size: 22 })], indent: { left: 360 }, spacing: { after: 100 } }))
            }
            const sortedCaptions = [...(panel.captions || [])].sort((a, b) => a.sort_order - b.sort_order)
            for (const caption of sortedCaptions) {
              const captionLabel = caption.caption_type === 'narrative' ? 'CAP' : caption.caption_type === 'location' ? 'LOCATION' : caption.caption_type === 'time' ? 'TIME' : 'CAP'
              children.push(new Paragraph({ children: [new TextRun({ text: `${captionLabel}: `, bold: true, size: 22 }), new TextRun({ text: caption.text, size: 22 })], indent: { left: 360 } }))
            }
            const sortedDialogue = [...(panel.dialogue_blocks || [])].sort((a, b) => a.sort_order - b.sort_order)
            for (const dialogue of sortedDialogue) {
              const characterName = dialogue.speaker_name ? dialogue.speaker_name.toUpperCase() : dialogue.character_id ? (characterMap.get(dialogue.character_id) || 'UNKNOWN').toUpperCase() : 'UNKNOWN'
              const dialogueSuffix = getDialogueSuffix(dialogue.dialogue_type)
              let modifierSuffix = ''
              if (dialogue.delivery_instruction && dialogue.dialogue_type === 'dialogue') { modifierSuffix = ` [${dialogue.delivery_instruction.toUpperCase()}]` }
              children.push(new Paragraph({ children: [new TextRun({ text: `${characterName}${dialogueSuffix}${modifierSuffix}: `, bold: true, size: 22 }), new TextRun({ text: dialogue.text, size: 22 })], indent: { left: 360 } }))
            }
            const sortedSfx = [...(panel.sound_effects || [])].sort((a, b) => a.sort_order - b.sort_order)
            for (const sfx of sortedSfx) {
              if (sfx.text) {
                children.push(new Paragraph({ children: [new TextRun({ text: `SFX: `, bold: true, size: 22 }), new TextRun({ text: sfx.text.toUpperCase(), bold: true, size: 22 })], indent: { left: 360 } }))
              }
            }
            if (includeNotes && panel.notes_to_artist) {
              children.push(new Paragraph({ children: [new TextRun({ text: `*Note to Artist: ${panel.notes_to_artist}*`, italics: true, size: 20, color: '666666' })], indent: { left: 360 }, spacing: { before: 50 } }))
            }
          })
          continue
        }

        // Page header - handle spreads vs. single pages
        let pageHeaderText: string
        if (pageType === 'SPREAD_LEFT') {
          const nextPageNum = page.page_number + 1
          pageHeaderText = `PAGES ${page.page_number}-${nextPageNum} (DOUBLE-PAGE SPREAD)`
        } else if (pageType === 'SPLASH') {
          pageHeaderText = `PAGE ${page.page_number} (${orientation}, SPLASH)`
        } else {
          pageHeaderText = `PAGE ${page.page_number} (${orientation})`
        }

        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: pageHeaderText,
                bold: true,
                size: 24,
              }),
            ],
            spacing: { before: 300, after: 150 },
          })
        )

        // Artist notes for the page
        if (page.notes_to_artist) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: `*Note to Artist: ${page.notes_to_artist}*`,
                  italics: true,
                  size: 20,
                  color: '666666',
                }),
              ],
              indent: { left: 360 },
              spacing: { after: 100 },
            })
          )
        }

        // Sort panels and restart panel numbering at 1 per page
        const sortedPanels = [...(page.panels || [])].sort((a, b) => a.panel_number - b.panel_number)

        sortedPanels.forEach((panel, panelIndex) => {
          // Panel numbers restart at 1 per page per spec
          const displayPanelNumber = panelIndex + 1

          // Panel header with shot type
          const shotType = panel.camera
            ? ` ${panel.camera.replace('_', ' ').toUpperCase()}.`
            : ''

          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: `PANEL ${displayPanelNumber}:`,
                  bold: true,
                  size: 22,
                }),
                new TextRun({
                  text: shotType,
                  size: 22,
                }),
              ],
              spacing: { before: 150 },
            })
          )

          // Visual description with auto-capitalized character names
          if (panel.visual_description) {
            const capitalizedDesc = autoCapitalizeCharacterNames(panel.visual_description, charNames)
            children.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: capitalizedDesc,
                    size: 22,
                  }),
                ],
                indent: { left: 360 }, // 0.25 inch
                spacing: { after: 100 },
              })
            )
          }

          // Captions (appear first in panel)
          const sortedCaptions = [...(panel.captions || [])].sort((a, b) => a.sort_order - b.sort_order)
          for (const caption of sortedCaptions) {
            const captionLabel =
              caption.caption_type === 'narrative' ? 'CAP' :
              caption.caption_type === 'location' ? 'LOCATION' :
              caption.caption_type === 'time' ? 'TIME' :
              'CAP'

            children.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: `${captionLabel}: `,
                    bold: true,
                    size: 22,
                  }),
                  new TextRun({
                    text: caption.text,
                    size: 22,
                  }),
                ],
                indent: { left: 360 },
              })
            )
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

            children.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: `${characterName}${dialogueSuffix}${modifierSuffix}: `,
                    bold: true,
                    size: 22,
                  }),
                  new TextRun({
                    text: dialogue.text,
                    size: 22,
                  }),
                ],
                indent: { left: 360 },
              })
            )
          }

          // Sound effects
          const sortedSfx = [...(panel.sound_effects || [])].sort((a, b) => a.sort_order - b.sort_order)
          for (const sfx of sortedSfx) {
            if (sfx.text) {
              children.push(
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `SFX: `,
                      bold: true,
                      size: 22,
                    }),
                    new TextRun({
                      text: sfx.text.toUpperCase(),
                      bold: true,
                      size: 22,
                    }),
                  ],
                  indent: { left: 360 },
                })
              )
            }
          }

          // Artist notes (optional)
          if (includeNotes && panel.notes_to_artist) {
            children.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: `*Note to Artist: ${panel.notes_to_artist}*`,
                    italics: true,
                    size: 20,
                    color: '666666',
                  }),
                ],
                indent: { left: 360 },
                spacing: { before: 50 },
              })
            )
          }
        })
      }
    }
  }

  // End of issue - spec format: "END OF ISSUE #[NUMBER]"
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `END OF ISSUE #${issue.number}`,
          bold: true,
          size: 24,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { before: 600 },
    })
  )

  // Create document
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440, // 1 inch in twips
              bottom: 1440,
              left: 1440,
              right: 1440,
            },
          },
        },
        children,
      },
    ],
  })

  // Generate and save
  const blob = await Packer.toBlob(doc)
  const filename = `${issue.series.title.replace(/[^a-z0-9]/gi, '_')}_Issue_${issue.number}.docx`
  saveAs(blob, filename)
}
