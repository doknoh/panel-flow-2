import { describe, test, expect } from 'vitest'
import { getSelectionGroups } from './selection-groups'

describe('getSelectionGroups', () => {
  test('returns empty map when no items are selected', () => {
    const result = getSelectionGroups(new Set(), ['a', 'b', 'c'])
    expect(result.size).toBe(0)
  })

  test('single selected item returns solo', () => {
    const result = getSelectionGroups(new Set(['b']), ['a', 'b', 'c'])
    expect(result.get('b')).toBe('solo')
    expect(result.size).toBe(1)
  })

  test('two adjacent selected items return first and last', () => {
    const result = getSelectionGroups(new Set(['b', 'c']), ['a', 'b', 'c', 'd'])
    expect(result.get('b')).toBe('first')
    expect(result.get('c')).toBe('last')
  })

  test('three adjacent selected items return first, middle, last', () => {
    const result = getSelectionGroups(new Set(['a', 'b', 'c']), ['a', 'b', 'c', 'd'])
    expect(result.get('a')).toBe('first')
    expect(result.get('b')).toBe('middle')
    expect(result.get('c')).toBe('last')
  })

  test('two non-adjacent selected items both return solo', () => {
    const result = getSelectionGroups(new Set(['a', 'c']), ['a', 'b', 'c', 'd'])
    expect(result.get('a')).toBe('solo')
    expect(result.get('c')).toBe('solo')
  })

  test('mixed: adjacent group + isolated item', () => {
    const result = getSelectionGroups(
      new Set(['p1', 'p2', 'p3', 'p5']),
      ['p1', 'p2', 'p3', 'p4', 'p5']
    )
    expect(result.get('p1')).toBe('first')
    expect(result.get('p2')).toBe('middle')
    expect(result.get('p3')).toBe('last')
    expect(result.get('p5')).toBe('solo')
  })

  test('two separate groups', () => {
    const result = getSelectionGroups(
      new Set(['a', 'b', 'd', 'e']),
      ['a', 'b', 'c', 'd', 'e']
    )
    expect(result.get('a')).toBe('first')
    expect(result.get('b')).toBe('last')
    expect(result.get('d')).toBe('first')
    expect(result.get('e')).toBe('last')
  })

  test('all items selected forms one group', () => {
    const result = getSelectionGroups(
      new Set(['a', 'b', 'c']),
      ['a', 'b', 'c']
    )
    expect(result.get('a')).toBe('first')
    expect(result.get('b')).toBe('middle')
    expect(result.get('c')).toBe('last')
  })

  test('selected items not in orderedIds are ignored', () => {
    const result = getSelectionGroups(
      new Set(['a', 'z']),
      ['a', 'b', 'c']
    )
    expect(result.get('a')).toBe('solo')
    expect(result.has('z')).toBe(false)
  })

  test('empty orderedIds returns empty map', () => {
    const result = getSelectionGroups(new Set(['a']), [])
    expect(result.size).toBe(0)
  })

  test('large middle group', () => {
    const result = getSelectionGroups(
      new Set(['b', 'c', 'd', 'e']),
      ['a', 'b', 'c', 'd', 'e', 'f']
    )
    expect(result.get('b')).toBe('first')
    expect(result.get('c')).toBe('middle')
    expect(result.get('d')).toBe('middle')
    expect(result.get('e')).toBe('last')
  })
})
