import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  PageBreak,
} from 'docx'
import { saveAs } from 'file-saver'

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
  notes: string | null
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
  title: string | null
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

export async function exportIssueToDocx(issue: Issue, includeNotes = false) {
  const characterMap = new Map(issue.series.characters.map(c => [c.id, c.name]))

  const children: Paragraph[] = []

  // Title
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

  // Issue title if exists
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

  // Summary
  if (issue.summary) {
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
            text: act.title || `ACT ${act.number}`,
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

        // Page header
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `PAGE ${page.page_number} (${orientation})`,
                bold: true,
                size: 24,
              }),
            ],
            spacing: { before: 300, after: 150 },
          })
        )

        // Sort panels
        const sortedPanels = [...(page.panels || [])].sort((a, b) => a.panel_number - b.panel_number)

        for (const panel of sortedPanels) {
          // Panel header with shot type
          const shotType = panel.shot_type
            ? ` ${panel.shot_type.replace('_', ' ').toUpperCase()}.`
            : ''

          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: `PANEL ${panel.panel_number}:`,
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

          // Visual description
          if (panel.visual_description) {
            children.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: panel.visual_description,
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

            children.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: `${characterName}${dialogueSuffix}: `,
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
          if (includeNotes && panel.notes) {
            children.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: `*Note to Artist: ${panel.notes}*`,
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
        }
      }
    }
  }

  // End of issue
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
