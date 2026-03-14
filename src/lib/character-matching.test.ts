import { describe, it, expect } from 'vitest'
import { matchSpeakerToCharacter, type MatchResult } from './character-matching'

const characters = [
  { id: '1', name: 'Marshall Mathers', display_name: 'MARSHALL', aliases: ['Eminem', 'Slim Shady', 'Em'] },
  { id: '2', name: 'Kimberly Scott', display_name: 'KIM', aliases: ['Kimmy'] },
  { id: '3', name: 'Stan Mitchell', display_name: 'STAN', aliases: [] },
]

describe('matchSpeakerToCharacter', () => {
  it('exact match on display_name (case-insensitive)', () => {
    const result = matchSpeakerToCharacter('MARSHALL', characters)
    expect(result.confidence).toBe('exact')
    expect(result.characterId).toBe('1')
  })

  it('exact match on name', () => {
    const result = matchSpeakerToCharacter('Marshall Mathers', characters)
    expect(result.confidence).toBe('exact')
    expect(result.characterId).toBe('1')
  })

  it('alias match', () => {
    const result = matchSpeakerToCharacter('Eminem', characters)
    expect(result.confidence).toBe('alias')
    expect(result.characterId).toBe('1')
  })

  it('alias match case-insensitive', () => {
    const result = matchSpeakerToCharacter('slim shady', characters)
    expect(result.confidence).toBe('alias')
    expect(result.characterId).toBe('1')
  })

  it('fuzzy match on partial name', () => {
    const result = matchSpeakerToCharacter('Kim', characters)
    expect(result.confidence).toBe('fuzzy')
    expect(result.characterId).toBe('2')
  })

  it('no match returns null', () => {
    const result = matchSpeakerToCharacter('Dr. Dre', characters)
    expect(result.confidence).toBe('none')
    expect(result.characterId).toBeNull()
  })
})
