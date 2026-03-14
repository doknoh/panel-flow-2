import { describe, it, expect } from 'vitest'
import { computeMirrorAlignment } from './mirror-diff'

describe('computeMirrorAlignment', () => {
  it('returns green when panel counts match and characters match', () => {
    const left = [
      { panel_number: 1, characters_present: ['char-a', 'char-b'], dialogue_blocks: [{ text: 'hi' }] },
      { panel_number: 2, characters_present: ['char-c'], dialogue_blocks: [] },
    ]
    const right = [
      { panel_number: 1, characters_present: ['char-a', 'char-b'], dialogue_blocks: [{ text: 'hello' }] },
      { panel_number: 2, characters_present: ['char-c'], dialogue_blocks: [{ text: 'yo' }] },
    ]
    const result = computeMirrorAlignment(left, right)
    expect(result).toHaveLength(2)
    expect(result[0].status).toBe('green')
    expect(result[1].status).toBe('yellow') // right has dialogue, left doesn't
  })

  it('returns yellow when panel counts differ', () => {
    const left = [{ panel_number: 1, characters_present: ['a'], dialogue_blocks: [] }]
    const right = [
      { panel_number: 1, characters_present: ['a'], dialogue_blocks: [] },
      { panel_number: 2, characters_present: ['b'], dialogue_blocks: [] },
    ]
    const result = computeMirrorAlignment(left, right)
    // Should still align panel 1 pair, and show panel 2 as unmatched
    expect(result.length).toBeGreaterThanOrEqual(2)
    expect(result[0].status).toBe('green')
    expect(result[1].status).toBe('yellow')
  })

  it('returns yellow when characters differ on corresponding panels', () => {
    const left = [{ panel_number: 1, characters_present: ['a'], dialogue_blocks: [] }]
    const right = [{ panel_number: 1, characters_present: ['b'], dialogue_blocks: [] }]
    const result = computeMirrorAlignment(left, right)
    expect(result[0].status).toBe('yellow')
  })

  it('handles empty panels arrays', () => {
    const result = computeMirrorAlignment([], [])
    expect(result).toHaveLength(0)
  })
})
