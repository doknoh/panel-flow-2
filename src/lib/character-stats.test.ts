import { describe, test, expect } from 'vitest'
import { escapeRegexForPostgres, buildNameMatchCondition } from './character-stats'

describe('character-stats', () => {
  describe('escapeRegexForPostgres', () => {
    test('escapes dots in names', () => {
      expect(escapeRegexForPostgres('J.J.')).toBe('J\\.J\\.')
    })

    test('escapes parentheses', () => {
      expect(escapeRegexForPostgres('Name (Jr.)')).toBe('Name \\(Jr\\.\\)')
    })

    test('passes through simple names unchanged', () => {
      expect(escapeRegexForPostgres('MARSHALL')).toBe('MARSHALL')
    })

    test('escapes apostrophes', () => {
      expect(escapeRegexForPostgres("O'BRIEN")).toBe("O\\'BRIEN")
    })

    test('escapes brackets', () => {
      expect(escapeRegexForPostgres('Name [III]')).toBe('Name \\[III\\]')
    })
  })

  describe('buildNameMatchCondition', () => {
    test('builds single name condition', () => {
      const result = buildNameMatchCondition('MARSHALL', [])
      expect(result).toContain("visual_description ~* '\\mMARSHALL\\M'")
    })

    test('builds condition with aliases', () => {
      const result = buildNameMatchCondition('MARSHALL', ['MARSH', 'MARSHALL MATHERS'])
      expect(result).toContain("visual_description ~* '\\mMARSHALL\\M'")
      expect(result).toContain("visual_description ~* '\\mMARSH\\M'")
      expect(result).toContain("visual_description ~* '\\mMARSHALL MATHERS\\M'")
      expect(result).toContain(' OR ')
    })

    test('escapes special characters in names', () => {
      const result = buildNameMatchCondition("O'BRIEN", [])
      expect(result).toContain("\\'")
    })

    test('handles empty aliases array', () => {
      const result = buildNameMatchCondition('KEN', [])
      expect(result).toBe("(visual_description ~* '\\mKEN\\M')")
    })
  })
})
