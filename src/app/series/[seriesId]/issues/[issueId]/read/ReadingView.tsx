'use client'

import React, { useMemo } from 'react'
import Link from 'next/link'
import ThemeToggle from '@/components/ui/ThemeToggle'

// ============================================================================
// Types
// ============================================================================

interface DialogueBlock {
  character_id: string | null
  speaker_name: string | null
  dialogue_type: string
  text: string
  delivery_instruction: string | null
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
  sort_order: number
  visual_description: string | null
  camera: string | null
  dialogue_blocks: DialogueBlock[]
  captions: Caption[]
  sound_effects: SoundEffect[]
}

interface Page {
  page_number: number
  page_type: string
  panels: Panel[]
}

interface Scene {
  sort_order: number
  pages: Page[]
}

interface Act {
  sort_order: number
  scenes: Scene[]
}

interface Issue {
  number: number
  title: string | null
  summary: string | null
  acts: Act[]
}

interface Character {
  id: string
  display_name: string
}

interface ReadingViewProps {
  seriesTitle: string
  seriesId: string
  issueId: string
  issue: Issue
  characters: Character[]
}

// ============================================================================
// Helpers
// ============================================================================

function getOrientation(pageNumber: number): string {
  return pageNumber % 2 === 1 ? 'right' : 'left'
}

function formatDialogueType(dialogueType: string): string {
  switch (dialogueType) {
    case 'thought':
      return ' (THOUGHT)'
    case 'whisper':
      return ' (WHISPER)'
    case 'shout':
      return ' (SHOUT)'
    case 'off_panel':
      return ' (O.S.)'
    case 'electronic':
      return ' (ELECTRONIC)'
    case 'dialogue':
    default:
      return ''
  }
}

function formatCaptionType(captionType: string): string {
  switch (captionType) {
    case 'location':
      return 'LOCATION CAP'
    case 'time':
      return 'TIME CAP'
    case 'narrative':
    default:
      return 'CAP'
  }
}

// ============================================================================
// Component
// ============================================================================

export default function ReadingView({
  seriesTitle,
  seriesId,
  issueId,
  issue,
  characters,
}: ReadingViewProps) {
  // Build a character lookup map
  const characterMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const char of characters) {
      map.set(char.id, char.display_name)
    }
    return map
  }, [characters])

  // Flatten all pages across acts and scenes in order
  const allPages = useMemo(() => {
    const pages: Page[] = []
    for (const act of issue.acts) {
      for (const scene of act.scenes) {
        for (const page of scene.pages) {
          pages.push(page)
        }
      }
    }
    return pages
  }, [issue.acts])

  // Resolve speaker name for a dialogue block
  function getSpeakerName(block: DialogueBlock): string {
    if (block.character_id) {
      return characterMap.get(block.character_id) || 'UNKNOWN'
    }
    if (block.speaker_name) {
      return block.speaker_name.toUpperCase()
    }
    return 'UNKNOWN'
  }

  // Get page header text
  function getPageHeader(page: Page): string {
    const orientation = getOrientation(page.page_number)
    if (page.page_type === 'SPREAD_LEFT') {
      return `PAGES ${page.page_number}-${page.page_number + 1} (DOUBLE-PAGE SPREAD)`
    }
    if (page.page_type === 'SPREAD_RIGHT') {
      // Skip rendering a separate header for the right side of a spread
      return ''
    }
    if (page.page_type === 'SPLASH') {
      return `PAGE ${page.page_number} (${orientation}) - SPLASH`
    }
    return `PAGE ${page.page_number} (${orientation})`
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--bg-primary)]">
        <div className="max-w-3xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link
            href={`/series/${seriesId}/issues/${issueId}`}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors type-micro"
          >
            &larr; BACK TO EDITOR
          </Link>
          <div className="flex items-center gap-3">
            <span className="type-micro text-[var(--text-muted)]">READING MODE</span>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Script content */}
      <main className="max-w-3xl mx-auto px-6 py-10">
        <div className="font-mono text-sm leading-relaxed">
          {/* Title block */}
          <div className="mb-10 text-center">
            <h1 className="text-lg font-bold tracking-wide">
              {seriesTitle.toUpperCase()} - ISSUE #{issue.number}
            </h1>
            {issue.title && (
              <p className="mt-1 text-[var(--text-secondary)]">
                CHAPTER {issue.number}: {issue.title.toUpperCase()}
              </p>
            )}
          </div>

          {/* Summary */}
          {issue.summary && (
            <div className="mb-10">
              <p className="font-bold mb-2">TL;DR SUMMARY</p>
              <p className="text-[var(--text-secondary)] whitespace-pre-wrap">{issue.summary}</p>
            </div>
          )}

          {/* Separator after summary */}
          {issue.summary && (
            <hr className="border-[var(--border)] mb-8" />
          )}

          {/* Pages */}
          {allPages.map((page, pageIndex) => {
            const header = getPageHeader(page)
            // Skip rendering for SPREAD_RIGHT pages (content belongs to SPREAD_LEFT)
            if (!header && page.page_type === 'SPREAD_RIGHT') {
              return null
            }

            // Panel numbers restart at 1 per page
            let panelCounter = 0

            return (
              <div key={`page-${page.page_number}`} className="mb-8">
                {/* Page divider (not before the first page) */}
                {pageIndex > 0 && (
                  <hr className="border-[var(--border)] mb-6" />
                )}

                {/* Page header */}
                <p className="font-bold text-[var(--text-primary)] mb-4">
                  {header}
                </p>

                {/* Panels */}
                {page.panels.map((panel) => {
                  panelCounter++
                  return (
                    <div key={`panel-${page.page_number}-${panelCounter}`} className="mb-5">
                      {/* Panel header + visual description */}
                      {panel.visual_description && (
                        <p className="mb-1">
                          <span className="font-bold">PANEL {panelCounter}:</span>{' '}
                          <span className="text-[var(--text-primary)]">
                            {panel.visual_description}
                          </span>
                        </p>
                      )}
                      {!panel.visual_description && (
                        <p className="mb-1">
                          <span className="font-bold">PANEL {panelCounter}:</span>{' '}
                          <span className="text-[var(--text-muted)] italic">
                            [No description]
                          </span>
                        </p>
                      )}

                      {/* Shot type note */}
                      {panel.camera && (
                        <p className="text-[var(--text-secondary)] text-xs mb-1 ml-4">
                          [{panel.camera}]
                        </p>
                      )}

                      {/* Dialogue blocks */}
                      {panel.dialogue_blocks.map((dialogue, dIdx) => {
                        const speaker = getSpeakerName(dialogue)
                        const typeIndicator = formatDialogueType(dialogue.dialogue_type)
                        const modifierText = dialogue.delivery_instruction
                          ? ` [${dialogue.delivery_instruction.toUpperCase()}]`
                          : ''

                        return (
                          <p key={`d-${dIdx}`} className="ml-8 mb-0.5">
                            <span className="font-bold">
                              {speaker}{typeIndicator}{modifierText}:
                            </span>{' '}
                            {dialogue.text}
                          </p>
                        )
                      })}

                      {/* Captions */}
                      {panel.captions.map((caption, cIdx) => {
                        const label = formatCaptionType(caption.caption_type)
                        return (
                          <p key={`c-${cIdx}`} className="ml-8 mb-0.5 text-[var(--text-secondary)]">
                            <span className="font-bold">{label}:</span>{' '}
                            {caption.text}
                          </p>
                        )
                      })}

                      {/* Sound effects */}
                      {panel.sound_effects.map((sfx, sIdx) => (
                        <p key={`sfx-${sIdx}`} className="ml-8 mb-0.5 font-bold">
                          SFX: {(sfx.text || '').toUpperCase()}
                        </p>
                      ))}
                    </div>
                  )
                })}
              </div>
            )
          })}

          {/* End marker */}
          <hr className="border-[var(--border)] my-8" />
          <p className="text-center font-bold text-[var(--text-secondary)]">
            END OF ISSUE #{issue.number}
          </p>
        </div>
      </main>
    </div>
  )
}
