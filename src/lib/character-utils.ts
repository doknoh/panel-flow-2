/**
 * Character Utilities for Panel Flow
 *
 * Handles scanning text for known character names and returning their UUIDs.
 * Used on panel description save to populate the characters_present array.
 */

/**
 * Scans text for known character names and returns their UUIDs.
 * Used on panel description save to populate characters_present array.
 * Checks both name and display_name (case-insensitive, word boundaries).
 */
export function scanCharactersPresent(
  text: string,
  characters: { id: string; name: string; display_name?: string | null }[]
): string[] {
  if (!text || characters.length === 0) return []

  const found = new Set<string>()

  for (const char of characters) {
    const names = [char.name]
    if (char.display_name) names.push(char.display_name)

    for (const name of names) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const regex = new RegExp(`(?<![a-zA-Z0-9])${escaped}(?![a-zA-Z0-9])`, 'i')
      if (regex.test(text)) {
        found.add(char.id)
        break // Found this character, no need to check other names
      }
    }
  }

  return Array.from(found)
}
