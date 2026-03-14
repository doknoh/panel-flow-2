import { describe, it, expect } from 'vitest'
import { scanCharactersPresent } from './character-utils'

const characters = [
  { id: 'uuid-1', name: 'Marshall', display_name: 'Marshall Kane' },
  { id: 'uuid-2', name: 'Maya', display_name: null },
  { id: 'uuid-3', name: 'Morgan', display_name: 'Dr. Morgan' },
]

describe('scanCharactersPresent', () => {
  it('returns empty array for empty text', () => {
    expect(scanCharactersPresent('', characters)).toEqual([])
  })

  it('detects character name case-insensitively', () => {
    const result = scanCharactersPresent('MARSHALL walks in.', characters)
    expect(result).toEqual(['uuid-1'])
  })

  it('detects display_name', () => {
    const result = scanCharactersPresent('Marshall Kane enters the room.', characters)
    expect(result).toEqual(['uuid-1'])
  })

  it('detects multiple characters', () => {
    const result = scanCharactersPresent('MARSHALL faces MAYA across the table.', characters)
    expect(result).toContain('uuid-1')
    expect(result).toContain('uuid-2')
    expect(result).toHaveLength(2)
  })

  it('returns unique IDs (no duplicates)', () => {
    const result = scanCharactersPresent('MARSHALL talks. MARSHALL walks.', characters)
    expect(result).toEqual(['uuid-1'])
  })

  it('detects names inside markdown bold', () => {
    const result = scanCharactersPresent('**MARSHALL** walks in.', characters)
    expect(result).toEqual(['uuid-1'])
  })

  it('does not match partial words', () => {
    const result = scanCharactersPresent('The marshal walks in.', characters)
    expect(result).toEqual([])
  })

  it('handles null display_name gracefully', () => {
    const result = scanCharactersPresent('MAYA stands guard.', characters)
    expect(result).toEqual(['uuid-2'])
  })

  it('returns empty array for no matches', () => {
    const result = scanCharactersPresent('An empty room.', characters)
    expect(result).toEqual([])
  })

  it('detects names inside markdown italic (underscore style)', () => {
    const result = scanCharactersPresent('_MARSHALL_ walks in.', characters)
    expect(result).toEqual(['uuid-1'])
  })

  it('returns empty array for empty characters list', () => {
    expect(scanCharactersPresent('Some text', [])).toEqual([])
  })
})
