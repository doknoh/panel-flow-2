export type PageType = 'SINGLE' | 'SPLASH' | 'SPREAD_LEFT' | 'SPREAD_RIGHT'

export interface FlatPage {
  page: {
    id: string
    page_type?: PageType
    linked_page_id?: string | null
    [key: string]: any // Allow other fields
  }
  scene: any
  act: any
  globalPageNumber: number
  orientation: 'left' | 'right'
  isSpread?: boolean
}

export interface SpreadGroup {
  left: FlatPage | null
  right: FlatPage | null
  isFirst: boolean
  isLinkedSpread: boolean // True if left and right are linked SPREAD_LEFT/SPREAD_RIGHT
  isSplash: boolean // True if this is a single splash page taking full spread
}

export function computeSpreads(flatPages: FlatPage[]): SpreadGroup[] {
  const spreads: SpreadGroup[] = []
  const processedIds = new Set<string>()

  // First spread: inside cover + page 1
  if (flatPages.length >= 1) {
    const firstPage = flatPages[0]
    const isSplash = firstPage.page.page_type === 'SPLASH'
    spreads.push({
      left: null,
      right: firstPage,
      isFirst: true,
      isLinkedSpread: false,
      isSplash,
    })
    processedIds.add(firstPage.page.id)
  }

  // Process remaining pages
  let i = 1
  while (i < flatPages.length) {
    const currentPage = flatPages[i]

    // Skip if already processed (part of a linked spread)
    if (processedIds.has(currentPage.page.id)) {
      i++
      continue
    }

    const pageType = currentPage.page.page_type || 'SINGLE'

    // Check if this is a linked spread
    if (pageType === 'SPREAD_LEFT' && currentPage.page.linked_page_id) {
      // Find the linked SPREAD_RIGHT page
      const linkedPage = flatPages.find(fp => fp.page.id === currentPage.page.linked_page_id)
      if (linkedPage && linkedPage.page.page_type === 'SPREAD_RIGHT') {
        spreads.push({
          left: currentPage,
          right: linkedPage,
          isFirst: false,
          isLinkedSpread: true,
          isSplash: false,
        })
        processedIds.add(currentPage.page.id)
        processedIds.add(linkedPage.page.id)
        i++
        continue
      }
    }

    // Check if this is a SPREAD_RIGHT that's linked (its partner is SPREAD_LEFT)
    if (pageType === 'SPREAD_RIGHT' && currentPage.page.linked_page_id) {
      // Find the linked SPREAD_LEFT page
      const linkedPage = flatPages.find(fp => fp.page.id === currentPage.page.linked_page_id)
      if (linkedPage && linkedPage.page.page_type === 'SPREAD_LEFT') {
        // This pair will be added when we encounter the SPREAD_LEFT, so skip
        i++
        continue
      }
    }

    // Check if this is a splash page (takes full spread width)
    if (pageType === 'SPLASH') {
      spreads.push({
        left: currentPage,
        right: null,
        isFirst: false,
        isLinkedSpread: false,
        isSplash: true,
      })
      processedIds.add(currentPage.page.id)
      i++
      continue
    }

    // Regular page pairing
    const nextPage = flatPages[i + 1]

    // Don't pair with a page that's part of a linked spread or splash
    const nextPageType = nextPage?.page.page_type || 'SINGLE'
    const nextIsLinked = nextPage?.page.linked_page_id != null
    const nextIsSplash = nextPageType === 'SPLASH'

    if (nextPage && !processedIds.has(nextPage.page.id) && !nextIsLinked && !nextIsSplash) {
      spreads.push({
        left: currentPage,
        right: nextPage,
        isFirst: false,
        isLinkedSpread: false,
        isSplash: false,
      })
      processedIds.add(currentPage.page.id)
      processedIds.add(nextPage.page.id)
      i += 2
    } else {
      // Single page on left with empty right
      spreads.push({
        left: currentPage,
        right: null,
        isFirst: false,
        isLinkedSpread: false,
        isSplash: false,
      })
      processedIds.add(currentPage.page.id)
      i++
    }
  }

  return spreads
}
