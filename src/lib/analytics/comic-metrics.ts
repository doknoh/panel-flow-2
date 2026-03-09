// Comic-book-specific analytics metrics
// Pure functions, no external dependencies except types

export interface CharacterPresence {
  characterId: string
  characterName: string
  panelCount: number
  totalPanels: number
  percentage: number
  pageAppearances: number[] // page numbers where they appear
}

export interface PanelDistribution {
  panelsPerPage: number
  pageCount: number
}

export interface DialogueDensity {
  sceneName: string
  sceneId: string
  dialogueWords: number
  totalWords: number
  ratio: number
}

export interface PacingData {
  pageNumber: number
  panelCount: number
  wordCount: number
  hasDialogue: boolean
}

function countWords(text: string | null | undefined): number {
  if (!text) return 0
  return text.split(/\s+/).filter((w) => w.length > 0).length
}

/**
 * Calculate character presence across an issue.
 * Counts which characters appear in dialogue_blocks across all panels.
 * Percentage = panelCount / totalPanels * 100.
 * Tracks which page numbers each character appears on.
 */
export function calculateCharacterPresence(
  acts: Array<{
    scenes: Array<{
      pages: Array<{
        page_number: number
        panels: Array<{
          dialogue_blocks: Array<{ character_id: string | null }>
        }>
      }>
    }>
  }>,
  characters: Array<{ id: string; name: string }>
): CharacterPresence[] {
  const characterMap = new Map<
    string,
    { panelCount: number; pageAppearances: Set<number> }
  >()

  // Initialize map for all known characters
  for (const char of characters) {
    characterMap.set(char.id, { panelCount: 0, pageAppearances: new Set() })
  }

  let totalPanels = 0

  for (const act of acts) {
    for (const scene of act.scenes) {
      for (const page of scene.pages) {
        for (const panel of page.panels) {
          totalPanels++

          // Collect unique character IDs in this panel
          const characterIdsInPanel = new Set<string>()
          for (const block of panel.dialogue_blocks) {
            if (block.character_id) {
              characterIdsInPanel.add(block.character_id)
            }
          }

          Array.from(characterIdsInPanel).forEach((charId) => {
            let entry = characterMap.get(charId)
            if (!entry) {
              // Character not in provided list but appears in dialogue
              entry = { panelCount: 0, pageAppearances: new Set() }
              characterMap.set(charId, entry)
            }
            entry.panelCount++
            entry.pageAppearances.add(page.page_number)
          })
        }
      }
    }
  }

  // Build lookup for character names
  const nameMap = new Map<string, string>()
  for (const char of characters) {
    nameMap.set(char.id, char.name)
  }

  const results: CharacterPresence[] = []

  Array.from(characterMap.entries()).forEach(([charId, data]) => {
    if (data.panelCount === 0) return

    const appearances: number[] = []
    data.pageAppearances.forEach((p) => appearances.push(p))
    appearances.sort((a, b) => a - b)

    results.push({
      characterId: charId,
      characterName: nameMap.get(charId) ?? charId,
      panelCount: data.panelCount,
      totalPanels,
      percentage:
        totalPanels > 0
          ? Math.round((data.panelCount / totalPanels) * 10000) / 100
          : 0,
      pageAppearances: appearances,
    })
  })

  // Sort by panelCount descending
  results.sort((a, b) => b.panelCount - a.panelCount)

  return results
}

/**
 * Calculate panels-per-page distribution.
 * Groups pages by how many panels they have, sorted by panelsPerPage ascending.
 */
export function calculatePanelDistribution(
  acts: Array<{
    scenes: Array<{
      pages: Array<{
        panels: Array<{ id: string }>
      }>
    }>
  }>
): PanelDistribution[] {
  const distribution = new Map<number, number>()

  for (const act of acts) {
    for (const scene of act.scenes) {
      for (const page of scene.pages) {
        const panelCount = page.panels.length
        distribution.set(panelCount, (distribution.get(panelCount) ?? 0) + 1)
      }
    }
  }

  const results: PanelDistribution[] = []

  Array.from(distribution.entries()).forEach(([panelsPerPage, pageCount]) => {
    results.push({ panelsPerPage, pageCount })
  })

  results.sort((a, b) => a.panelsPerPage - b.panelsPerPage)

  return results
}

/**
 * Calculate dialogue density per scene.
 * For each scene, counts dialogue words vs total words
 * (visual_description + dialogue + captions).
 * Sorted by ratio descending.
 */
export function calculateDialogueDensity(
  acts: Array<{
    name?: string
    scenes: Array<{
      id: string
      name?: string
      title?: string
      pages: Array<{
        panels: Array<{
          visual_description: string | null
          dialogue_blocks: Array<{ text: string }>
          captions: Array<{ text: string }>
        }>
      }>
    }>
  }>
): DialogueDensity[] {
  const results: DialogueDensity[] = []

  for (const act of acts) {
    for (const scene of act.scenes) {
      let dialogueWords = 0
      let totalWords = 0

      for (const page of scene.pages) {
        for (const panel of page.panels) {
          const descWords = countWords(panel.visual_description)
          totalWords += descWords

          for (const block of panel.dialogue_blocks) {
            const words = countWords(block.text)
            dialogueWords += words
            totalWords += words
          }

          for (const caption of panel.captions) {
            const words = countWords(caption.text)
            totalWords += words
          }
        }
      }

      const sceneName = scene.title ?? scene.name ?? 'Untitled Scene'

      results.push({
        sceneName,
        sceneId: scene.id,
        dialogueWords,
        totalWords,
        ratio:
          totalWords > 0
            ? Math.round((dialogueWords / totalWords) * 10000) / 100
            : 0,
      })
    }
  }

  results.sort((a, b) => b.ratio - a.ratio)

  return results
}

/**
 * Generate pacing data per page.
 * For each page, counts panels and total word count,
 * and whether it has any dialogue.
 */
export function calculatePacingData(
  acts: Array<{
    scenes: Array<{
      pages: Array<{
        page_number: number
        panels: Array<{
          visual_description: string | null
          dialogue_blocks: Array<{ text: string }>
          captions: Array<{ text: string }>
        }>
      }>
    }>
  }>
): PacingData[] {
  const results: PacingData[] = []

  for (const act of acts) {
    for (const scene of act.scenes) {
      for (const page of scene.pages) {
        let wordCount = 0
        let hasDialogue = false

        for (const panel of page.panels) {
          wordCount += countWords(panel.visual_description)

          for (const block of panel.dialogue_blocks) {
            const words = countWords(block.text)
            wordCount += words
            if (words > 0) {
              hasDialogue = true
            }
          }

          for (const caption of panel.captions) {
            wordCount += countWords(caption.text)
          }
        }

        results.push({
          pageNumber: page.page_number,
          panelCount: page.panels.length,
          wordCount,
          hasDialogue,
        })
      }
    }
  }

  // Sort by page number
  results.sort((a, b) => a.pageNumber - b.pageNumber)

  return results
}
