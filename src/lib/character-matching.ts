export interface CharacterForMatching {
  id: string
  name: string
  display_name: string | null
  aliases?: string[]
}

export interface MatchResult {
  characterId: string | null
  confidence: 'exact' | 'alias' | 'fuzzy' | 'none'
  matchedOn?: string
}

export function matchSpeakerToCharacter(
  speaker: string,
  characters: CharacterForMatching[]
): MatchResult {
  const speakerLower = speaker.toLowerCase().trim()

  // 1. Exact match on display_name (literal, case-insensitive only when both sides same case style)
  //    or exact match on name (case-insensitive)
  for (const char of characters) {
    if (char.display_name && char.display_name.toLowerCase() === speakerLower) {
      // Only treat as exact if the speaker is all-caps (matches display_name style)
      // or the speaker literally equals the display_name
      const speakerIsAllCaps = speaker === speaker.toUpperCase()
      if (speakerIsAllCaps || speaker === char.display_name) {
        return { characterId: char.id, confidence: 'exact', matchedOn: 'display_name' }
      }
    }
    if (char.name.toLowerCase() === speakerLower) {
      return { characterId: char.id, confidence: 'exact', matchedOn: 'name' }
    }
  }

  // 2. Alias match
  for (const char of characters) {
    for (const alias of char.aliases || []) {
      if (alias.toLowerCase() === speakerLower) {
        return { characterId: char.id, confidence: 'alias', matchedOn: `alias: ${alias}` }
      }
    }
  }

  // 3. Fuzzy: substring matching
  for (const char of characters) {
    const nameLower = char.name.toLowerCase()
    const displayLower = (char.display_name || '').toLowerCase()
    if (
      (speakerLower.length >= 3 && nameLower.includes(speakerLower)) ||
      (speakerLower.length >= 3 && displayLower.includes(speakerLower)) ||
      (nameLower.length >= 3 && speakerLower.includes(nameLower))
    ) {
      return { characterId: char.id, confidence: 'fuzzy', matchedOn: 'partial' }
    }
  }

  return { characterId: null, confidence: 'none' }
}

export function batchMatchSpeakers(
  speakers: string[],
  characters: CharacterForMatching[]
): Map<string, MatchResult> {
  const results = new Map<string, MatchResult>()
  for (const speaker of speakers) {
    results.set(speaker, matchSpeakerToCharacter(speaker, characters))
  }
  return results
}
