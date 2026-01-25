// Search utilities for Find & Replace functionality

export interface SearchMatch {
  type: 'visual_description' | 'dialogue' | 'caption' | 'sfx' | 'notes'
  actNumber: number
  sceneTitle: string | null
  pageNumber: number
  panelNumber: number
  fieldName: string
  text: string
  matchStart: number
  matchEnd: number
  // IDs for database updates
  panelId: string
  dialogueBlockId?: string
  captionId?: string
  sfxId?: string
}

export interface SearchOptions {
  matchCase: boolean
  wholeWord: boolean
}

export function searchIssue(
  issue: any,
  searchTerm: string,
  options: SearchOptions = { matchCase: false, wholeWord: false }
): SearchMatch[] {
  if (!searchTerm) return []

  const matches: SearchMatch[] = []
  const regex = createSearchRegex(searchTerm, options)

  for (const act of issue.acts || []) {
    for (const scene of act.scenes || []) {
      for (const page of scene.pages || []) {
        for (const panel of page.panels || []) {
          // Search visual description
          if (panel.visual_description) {
            const textMatches = findAllMatches(panel.visual_description, regex)
            for (const match of textMatches) {
              matches.push({
                type: 'visual_description',
                actNumber: act.number,
                sceneTitle: scene.title,
                pageNumber: page.page_number,
                panelNumber: panel.panel_number || panel.sort_order + 1,
                fieldName: 'Visual Description',
                text: panel.visual_description,
                matchStart: match.start,
                matchEnd: match.end,
                panelId: panel.id,
              })
            }
          }

          // Search internal notes
          if (panel.notes) {
            const textMatches = findAllMatches(panel.notes, regex)
            for (const match of textMatches) {
              matches.push({
                type: 'notes',
                actNumber: act.number,
                sceneTitle: scene.title,
                pageNumber: page.page_number,
                panelNumber: panel.panel_number || panel.sort_order + 1,
                fieldName: 'Internal Notes',
                text: panel.notes,
                matchStart: match.start,
                matchEnd: match.end,
                panelId: panel.id,
              })
            }
          }

          // Search dialogue blocks
          for (const dialogue of panel.dialogue_blocks || []) {
            if (dialogue.text) {
              const textMatches = findAllMatches(dialogue.text, regex)
              for (const match of textMatches) {
                matches.push({
                  type: 'dialogue',
                  actNumber: act.number,
                  sceneTitle: scene.title,
                  pageNumber: page.page_number,
                  panelNumber: panel.panel_number || panel.sort_order + 1,
                  fieldName: `Dialogue (${dialogue.speaker_name || 'Unknown'})`,
                  text: dialogue.text,
                  matchStart: match.start,
                  matchEnd: match.end,
                  panelId: panel.id,
                  dialogueBlockId: dialogue.id,
                })
              }
            }
          }

          // Search captions
          for (const caption of panel.captions || []) {
            if (caption.text) {
              const textMatches = findAllMatches(caption.text, regex)
              for (const match of textMatches) {
                matches.push({
                  type: 'caption',
                  actNumber: act.number,
                  sceneTitle: scene.title,
                  pageNumber: page.page_number,
                  panelNumber: panel.panel_number || panel.sort_order + 1,
                  fieldName: `Caption (${caption.caption_type || caption.type || 'narration'})`,
                  text: caption.text,
                  matchStart: match.start,
                  matchEnd: match.end,
                  panelId: panel.id,
                  captionId: caption.id,
                })
              }
            }
          }

          // Search sound effects
          for (const sfx of panel.sound_effects || []) {
            if (sfx.text) {
              const textMatches = findAllMatches(sfx.text, regex)
              for (const match of textMatches) {
                matches.push({
                  type: 'sfx',
                  actNumber: act.number,
                  sceneTitle: scene.title,
                  pageNumber: page.page_number,
                  panelNumber: panel.panel_number || panel.sort_order + 1,
                  fieldName: 'Sound Effect',
                  text: sfx.text,
                  matchStart: match.start,
                  matchEnd: match.end,
                  panelId: panel.id,
                  sfxId: sfx.id,
                })
              }
            }
          }
        }
      }
    }
  }

  return matches
}

function createSearchRegex(searchTerm: string, options: SearchOptions): RegExp {
  // Escape special regex characters
  let pattern = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  if (options.wholeWord) {
    pattern = `\\b${pattern}\\b`
  }

  const flags = options.matchCase ? 'g' : 'gi'
  return new RegExp(pattern, flags)
}

function findAllMatches(text: string, regex: RegExp): { start: number; end: number }[] {
  const matches: { start: number; end: number }[] = []
  let match

  // Reset regex lastIndex
  regex.lastIndex = 0

  while ((match = regex.exec(text)) !== null) {
    matches.push({
      start: match.index,
      end: match.index + match[0].length,
    })
  }

  return matches
}

export function replaceInText(
  text: string,
  searchTerm: string,
  replaceTerm: string,
  options: SearchOptions
): string {
  const regex = createSearchRegex(searchTerm, options)
  return text.replace(regex, replaceTerm)
}

export function countMatches(
  text: string,
  searchTerm: string,
  options: SearchOptions
): number {
  if (!text || !searchTerm) return 0
  const regex = createSearchRegex(searchTerm, options)
  const matches = text.match(regex)
  return matches ? matches.length : 0
}

export function highlightMatch(text: string, start: number, end: number): {
  before: string
  match: string
  after: string
} {
  return {
    before: text.substring(0, start),
    match: text.substring(start, end),
    after: text.substring(end),
  }
}

export function getContextAroundMatch(
  text: string,
  matchStart: number,
  matchEnd: number,
  contextChars: number = 30
): string {
  const start = Math.max(0, matchStart - contextChars)
  const end = Math.min(text.length, matchEnd + contextChars)

  let result = ''
  if (start > 0) result += '...'
  result += text.substring(start, matchStart)
  result += `[${text.substring(matchStart, matchEnd)}]`
  result += text.substring(matchEnd, end)
  if (end < text.length) result += '...'

  return result
}
