import { describe, it, expect, beforeEach } from 'vitest'
import { computeSpreads, FlatPage, PageType } from './weave-spreads'

let idCounter = 0

function makeFlatPage(overrides?: {
  id?: string
  page_type?: PageType
  linked_page_id?: string | null
  globalPageNumber?: number
  orientation?: 'left' | 'right'
}): FlatPage {
  idCounter++
  const id = overrides?.id ?? `page-${idCounter}`
  return {
    page: {
      id,
      page_type: overrides?.page_type,
      linked_page_id: overrides?.linked_page_id ?? null,
    },
    scene: {},
    act: {},
    globalPageNumber: overrides?.globalPageNumber ?? idCounter,
    orientation: overrides?.orientation ?? 'right',
  }
}

describe('computeSpreads', () => {
  beforeEach(() => {
    idCounter = 0
  })

  it('returns empty array for empty input', () => {
    const result = computeSpreads([])
    expect(result).toEqual([])
  })

  it('single page creates first spread with null left and page on right', () => {
    const p1 = makeFlatPage()
    const result = computeSpreads([p1])
    expect(result).toHaveLength(1)
    expect(result[0].left).toBeNull()
    expect(result[0].right).toBe(p1)
    expect(result[0].isFirst).toBe(true)
    expect(result[0].isLinkedSpread).toBe(false)
    expect(result[0].isSplash).toBe(false)
  })

  it('two pages: first spread (null + p1) then second spread (p2 left, null right)', () => {
    const p1 = makeFlatPage()
    const p2 = makeFlatPage()
    const result = computeSpreads([p1, p2])
    expect(result).toHaveLength(2)
    // First spread
    expect(result[0].left).toBeNull()
    expect(result[0].right).toBe(p1)
    expect(result[0].isFirst).toBe(true)
    // Second spread: p2 is on left with empty right
    expect(result[1].left).toBe(p2)
    expect(result[1].right).toBeNull()
    expect(result[1].isFirst).toBe(false)
  })

  it('three pages: first spread (null + p1), second spread (p2 + p3)', () => {
    const p1 = makeFlatPage()
    const p2 = makeFlatPage()
    const p3 = makeFlatPage()
    const result = computeSpreads([p1, p2, p3])
    expect(result).toHaveLength(2)
    // First spread: inside cover + p1
    expect(result[0].left).toBeNull()
    expect(result[0].right).toBe(p1)
    expect(result[0].isFirst).toBe(true)
    // Second spread: p2 + p3
    expect(result[1].left).toBe(p2)
    expect(result[1].right).toBe(p3)
    expect(result[1].isFirst).toBe(false)
    expect(result[1].isLinkedSpread).toBe(false)
  })

  it('SPREAD_LEFT + SPREAD_RIGHT linked pages produce isLinkedSpread: true', () => {
    const p1 = makeFlatPage()
    const leftId = `linked-left-${++idCounter}`
    const rightId = `linked-right-${++idCounter}`
    const spreadLeft = makeFlatPage({ id: leftId, page_type: 'SPREAD_LEFT', linked_page_id: rightId })
    const spreadRight = makeFlatPage({ id: rightId, page_type: 'SPREAD_RIGHT', linked_page_id: leftId })

    const result = computeSpreads([p1, spreadLeft, spreadRight])
    expect(result).toHaveLength(2)
    // First spread: cover + p1
    expect(result[0].right).toBe(p1)
    // Second spread: linked spread
    expect(result[1].left).toBe(spreadLeft)
    expect(result[1].right).toBe(spreadRight)
    expect(result[1].isLinkedSpread).toBe(true)
    expect(result[1].isSplash).toBe(false)
  })

  it('SPLASH page creates isSplash: true solo spread', () => {
    const p1 = makeFlatPage()
    const splash = makeFlatPage({ page_type: 'SPLASH' })

    const result = computeSpreads([p1, splash])
    expect(result).toHaveLength(2)
    // First spread
    expect(result[0].right).toBe(p1)
    // Splash spread
    expect(result[1].left).toBe(splash)
    expect(result[1].right).toBeNull()
    expect(result[1].isSplash).toBe(true)
    expect(result[1].isLinkedSpread).toBe(false)
  })

  it('SPLASH on page 1 sets isSplash on first spread', () => {
    const splash = makeFlatPage({ page_type: 'SPLASH' })
    const result = computeSpreads([splash])
    expect(result).toHaveLength(1)
    expect(result[0].isFirst).toBe(true)
    expect(result[0].isSplash).toBe(true)
    expect(result[0].right).toBe(splash)
  })

  it('mixed types: SINGLE, SPLASH, LINKED in sequence', () => {
    const p1 = makeFlatPage()
    const leftId = `ml-left-${++idCounter}`
    const rightId = `ml-right-${++idCounter}`
    const splash = makeFlatPage({ page_type: 'SPLASH' })
    const spreadLeft = makeFlatPage({ id: leftId, page_type: 'SPREAD_LEFT', linked_page_id: rightId })
    const spreadRight = makeFlatPage({ id: rightId, page_type: 'SPREAD_RIGHT', linked_page_id: leftId })
    const p2 = makeFlatPage()

    const pages = [p1, splash, spreadLeft, spreadRight, p2]
    const result = computeSpreads(pages)

    // Expect: [cover+p1, splash solo, linked spread, p2 solo]
    expect(result).toHaveLength(4)
    expect(result[0].right).toBe(p1)
    expect(result[0].isFirst).toBe(true)
    expect(result[1].left).toBe(splash)
    expect(result[1].isSplash).toBe(true)
    expect(result[2].left).toBe(spreadLeft)
    expect(result[2].right).toBe(spreadRight)
    expect(result[2].isLinkedSpread).toBe(true)
    expect(result[3].left).toBe(p2)
    expect(result[3].right).toBeNull()
  })

  it('odd number of regular pages: last page is solo on left with null right', () => {
    // 4 pages: cover+p1, p2+p3, p4 solo
    const p1 = makeFlatPage()
    const p2 = makeFlatPage()
    const p3 = makeFlatPage()
    const p4 = makeFlatPage()

    const result = computeSpreads([p1, p2, p3, p4])
    expect(result).toHaveLength(3)
    expect(result[0].right).toBe(p1)
    expect(result[0].isFirst).toBe(true)
    expect(result[1].left).toBe(p2)
    expect(result[1].right).toBe(p3)
    expect(result[2].left).toBe(p4)
    expect(result[2].right).toBeNull()
  })
})
