// Auto-formatting utilities for comic scripts

interface Character {
  id: string
  name: string
  display_name: string
}

/**
 * Auto-capitalize character names in visual descriptions.
 * Per CLAUDE.md: "Marshall walks in" → "MARSHALL walks in"
 * Applied on field blur when user leaves the field.
 * Does NOT apply inside dialogue text.
 */
export function capitalizeCharacterNames(
  text: string,
  characters: Character[]
): string {
  if (!text || !characters || characters.length === 0) return text

  let result = text

  for (const character of characters) {
    // Use display_name if available, otherwise name
    const displayName = character.display_name || character.name
    if (!displayName) continue

    // Create regex to find the character name (case-insensitive, word boundary)
    // This matches the name when it's a standalone word
    const escapedName = displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`\\b${escapedName}\\b`, 'gi')

    // Replace with uppercase version
    result = result.replace(regex, displayName.toUpperCase())
  }

  return result
}

/**
 * Check if text contains any character names that need capitalization
 */
export function hasUncapitalizedCharacterNames(
  text: string,
  characters: Character[]
): boolean {
  if (!text || !characters || characters.length === 0) return false

  for (const character of characters) {
    const displayName = character.display_name || character.name
    if (!displayName) continue

    // Check if the name appears but not fully capitalized
    const escapedName = displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`\\b${escapedName}\\b`, 'gi')
    const matches = text.match(regex)

    if (matches) {
      // Check if any match is not fully uppercase
      const uppercaseName = displayName.toUpperCase()
      if (matches.some(match => match !== uppercaseName)) {
        return true
      }
    }
  }

  return false
}

/**
 * Format dialogue speaker name (always uppercase)
 */
export function formatSpeakerName(name: string): string {
  return name.toUpperCase()
}

/**
 * Auto-number panels on a page (restarting at 1 per page for export)
 */
export function getPanelNumber(panelIndex: number): number {
  return panelIndex + 1
}

/**
 * Format page orientation for export
 */
export function formatPageOrientation(pageNumber: number): 'LEFT' | 'RIGHT' {
  // Odd pages are RIGHT (recto), even pages are LEFT (verso)
  return pageNumber % 2 === 1 ? 'RIGHT' : 'LEFT'
}
