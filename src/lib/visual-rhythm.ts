// Visual Rhythm Analysis
// Panel density graphs, silent beats, action tempo

import { countWords } from './pacing'

// ============================================
// TYPES
// ============================================

export interface PanelData {
  id: string
  visual_description?: string | null
  dialogue_blocks?: Array<{ text: string }> | null
  captions?: Array<{ text: string }> | null
}

export interface PageData {
  id: string
  page_number: number
  page_type?: 'SINGLE' | 'SPLASH' | 'SPREAD_LEFT' | 'SPREAD_RIGHT' | null
  panels: PanelData[]
}

export interface SceneData {
  id: string
  title?: string | null
  pages: PageData[]
}

export interface ActData {
  id: string
  name?: string | null
  scenes: SceneData[]
}

export type PageDensity = 'sparse' | 'normal' | 'dense'
export type OverallTempo = 'slow' | 'moderate' | 'fast' | 'variable'

export interface PageRhythm {
  pageId: string
  pageNumber: number
  pageType: string
  panelCount: number
  wordCount: number
  dialoguePanels: number
  silentPanels: number
  actionPanels: number // Inferred from visual descriptions
  density: PageDensity
  isLeftPage: boolean
  isSplash: boolean
  isSpread: boolean
}

export interface SilentSequence {
  startPage: number
  endPage: number
  length: number
  pages: number[]
}

export interface RhythmInsight {
  type: 'warning' | 'suggestion' | 'strength'
  severity: 'low' | 'medium' | 'high'
  message: string
  pages?: number[]
}

export interface IssueRhythm {
  pages: PageRhythm[]
  overallTempo: OverallTempo
  avgPanelsPerPage: number
  silentRatio: number
  dialogueRatio: number
  actionRatio: number
  silentSequences: SilentSequence[]
  insights: RhythmInsight[]
}

// ============================================
// THRESHOLDS
// ============================================

export const RHYTHM_THRESHOLDS = {
  density: {
    sparse: 3, // <= 3 panels = sparse
    normal: 6, // 4-6 panels = normal
    dense: 7,  // >= 7 panels = dense
  },
  silentRatio: {
    ideal: { min: 0.1, max: 0.25 },
    tooFew: 0.05,
    tooMany: 0.4,
  },
  dialogueRatio: {
    ideal: { min: 0.4, max: 0.7 },
  },
  sequence: {
    minSilentLength: 2, // At least 2 pages for a "sequence"
  },
}

// Action keywords in visual descriptions
const ACTION_KEYWORDS = [
  'punches', 'kicks', 'jumps', 'runs', 'falls', 'crashes', 'explodes',
  'fights', 'attacks', 'dodges', 'swings', 'shoots', 'flies', 'lands',
  'smashes', 'throws', 'catches', 'leaps', 'dives', 'charges', 'strikes',
  'impact', 'collision', 'action', 'motion', 'blur', 'speed', 'chase',
]

// ============================================
// CALCULATIONS
// ============================================

/**
 * Check if a visual description suggests action
 */
function isActionPanel(visualDescription: string | null | undefined): boolean {
  if (!visualDescription) return false
  const lower = visualDescription.toLowerCase()
  return ACTION_KEYWORDS.some(keyword => lower.includes(keyword))
}

/**
 * Calculate rhythm metrics for a single page
 */
export function calculatePageRhythm(page: PageData): PageRhythm {
  const panels = page.panels || []
  let wordCount = 0
  let dialoguePanels = 0
  let silentPanels = 0
  let actionPanels = 0

  for (const panel of panels) {
    // Count words
    const dialogueWords = (panel.dialogue_blocks || [])
      .reduce((sum, d) => sum + countWords(d.text), 0)
    const captionWords = (panel.captions || [])
      .reduce((sum, c) => sum + countWords(c.text), 0)
    const panelWords = dialogueWords + captionWords
    wordCount += panelWords

    // Categorize panel
    if ((panel.dialogue_blocks?.length || 0) > 0) {
      dialoguePanels++
    }
    if (panelWords === 0) {
      silentPanels++
    }
    if (isActionPanel(panel.visual_description)) {
      actionPanels++
    }
  }

  const panelCount = panels.length
  const pageType = page.page_type || 'SINGLE'

  // Determine density
  let density: PageDensity = 'normal'
  if (panelCount <= RHYTHM_THRESHOLDS.density.sparse) {
    density = 'sparse'
  } else if (panelCount >= RHYTHM_THRESHOLDS.density.dense) {
    density = 'dense'
  }

  // Page position (odd = right, even = left in standard comic layout)
  // Page 1 is right, page 2 is left, etc.
  const isLeftPage = page.page_number % 2 === 0

  return {
    pageId: page.id,
    pageNumber: page.page_number,
    pageType,
    panelCount,
    wordCount,
    dialoguePanels,
    silentPanels,
    actionPanels,
    density,
    isLeftPage,
    isSplash: pageType === 'SPLASH',
    isSpread: pageType === 'SPREAD_LEFT' || pageType === 'SPREAD_RIGHT',
  }
}

/**
 * Identify silent sequences (consecutive pages with mostly silent panels)
 */
export function identifySilentSequences(pages: PageRhythm[]): SilentSequence[] {
  const sequences: SilentSequence[] = []
  let currentSequence: number[] = []

  for (const page of pages) {
    const silentRatio = page.panelCount > 0 ? page.silentPanels / page.panelCount : 0
    const isMostlySilent = silentRatio >= 0.5 || page.wordCount < 20

    if (isMostlySilent) {
      currentSequence.push(page.pageNumber)
    } else {
      if (currentSequence.length >= RHYTHM_THRESHOLDS.sequence.minSilentLength) {
        sequences.push({
          startPage: currentSequence[0],
          endPage: currentSequence[currentSequence.length - 1],
          length: currentSequence.length,
          pages: [...currentSequence],
        })
      }
      currentSequence = []
    }
  }

  // Don't forget the last sequence
  if (currentSequence.length >= RHYTHM_THRESHOLDS.sequence.minSilentLength) {
    sequences.push({
      startPage: currentSequence[0],
      endPage: currentSequence[currentSequence.length - 1],
      length: currentSequence.length,
      pages: [...currentSequence],
    })
  }

  return sequences
}

/**
 * Determine overall tempo based on page densities
 */
export function determineOverallTempo(pages: PageRhythm[]): OverallTempo {
  if (pages.length === 0) return 'moderate'

  const densityCounts = { sparse: 0, normal: 0, dense: 0 }
  for (const page of pages) {
    densityCounts[page.density]++
  }

  const total = pages.length
  const sparseRatio = densityCounts.sparse / total
  const denseRatio = densityCounts.dense / total
  const normalRatio = densityCounts.normal / total

  // Check for variability
  const hasVariety = sparseRatio > 0.15 && denseRatio > 0.15

  if (hasVariety) return 'variable'
  if (denseRatio > 0.5) return 'fast'
  if (sparseRatio > 0.5) return 'slow'
  return 'moderate'
}

/**
 * Generate rhythm insights
 */
export function generateRhythmInsights(
  pages: PageRhythm[],
  silentSequences: SilentSequence[],
  overallTempo: OverallTempo,
  silentRatio: number,
  dialogueRatio: number
): RhythmInsight[] {
  const insights: RhythmInsight[] = []

  // Tempo assessment
  if (overallTempo === 'variable') {
    insights.push({
      type: 'strength',
      severity: 'low',
      message: 'Good pacing variety—not monotonous',
    })
  } else if (overallTempo === 'fast') {
    insights.push({
      type: 'suggestion',
      severity: 'medium',
      message: 'Fast, dense pacing throughout',
      pages: pages.filter(p => p.density === 'dense').map(p => p.pageNumber),
    })
  } else if (overallTempo === 'slow') {
    insights.push({
      type: 'suggestion',
      severity: 'medium',
      message: 'Slow, sparse pacing throughout',
      pages: pages.filter(p => p.density === 'sparse').map(p => p.pageNumber),
    })
  }

  // Silent sequence assessment
  if (silentSequences.length > 0) {
    const longestSequence = silentSequences.reduce((a, b) => a.length > b.length ? a : b)
    if (longestSequence.length >= 2 && longestSequence.length <= 4) {
      insights.push({
        type: 'strength',
        severity: 'low',
        message: `Good visual breathing room (pages ${longestSequence.startPage}-${longestSequence.endPage})`,
        pages: longestSequence.pages,
      })
    } else if (longestSequence.length > 4) {
      insights.push({
        type: 'suggestion',
        severity: 'medium',
        message: `Long silent sequence (${longestSequence.length} pages)`,
        pages: longestSequence.pages,
      })
    }
  } else if (pages.length > 10) {
    insights.push({
      type: 'suggestion',
      severity: 'low',
      message: 'No significant silent sequences',
    })
  }

  // Silent ratio assessment
  if (silentRatio >= RHYTHM_THRESHOLDS.silentRatio.ideal.min &&
      silentRatio <= RHYTHM_THRESHOLDS.silentRatio.ideal.max) {
    insights.push({
      type: 'strength',
      severity: 'low',
      message: `Healthy silent panel ratio (${Math.round(silentRatio * 100)}%)`,
    })
  } else if (silentRatio < RHYTHM_THRESHOLDS.silentRatio.tooFew) {
    insights.push({
      type: 'suggestion',
      severity: 'medium',
      message: 'Few silent panels—consider visual breathing room',
    })
  } else if (silentRatio > RHYTHM_THRESHOLDS.silentRatio.tooMany) {
    insights.push({
      type: 'suggestion',
      severity: 'medium',
      message: 'Many silent panels—ensure story clarity',
    })
  }

  // Dense page clusters
  const densePages = pages.filter(p => p.density === 'dense')
  if (densePages.length >= 3) {
    // Find consecutive dense pages
    let consecutiveCount = 1
    let maxConsecutive = 1
    let consecutiveStart = densePages[0]?.pageNumber
    let maxStart = consecutiveStart

    for (let i = 1; i < densePages.length; i++) {
      if (densePages[i].pageNumber === densePages[i - 1].pageNumber + 1) {
        consecutiveCount++
        if (consecutiveCount > maxConsecutive) {
          maxConsecutive = consecutiveCount
          maxStart = consecutiveStart
        }
      } else {
        consecutiveCount = 1
        consecutiveStart = densePages[i].pageNumber
      }
    }

    if (maxConsecutive >= 3) {
      insights.push({
        type: 'warning',
        severity: 'medium',
        message: `${maxConsecutive} consecutive dense pages`,
        pages: Array.from({ length: maxConsecutive }, (_, i) => maxStart + i),
      })
    }
  }

  // Splash/spread assessment
  const splashCount = pages.filter(p => p.isSplash || p.isSpread).length
  if (splashCount > 0 && pages.length > 0) {
    const splashRatio = splashCount / pages.length
    if (splashRatio > 0.2) {
      insights.push({
        type: 'suggestion',
        severity: 'low',
        message: `High splash/spread usage (${splashCount} pages)`,
      })
    }
  }

  return insights
}

/**
 * Analyze an entire issue's visual rhythm
 */
export function analyzeIssueRhythm(acts: ActData[]): IssueRhythm {
  // Flatten all pages
  const allPages: PageData[] = []
  for (const act of acts) {
    for (const scene of act.scenes || []) {
      for (const page of scene.pages || []) {
        allPages.push(page)
      }
    }
  }

  // Sort by page number
  allPages.sort((a, b) => a.page_number - b.page_number)

  // Calculate per-page rhythm
  const pages = allPages.map(calculatePageRhythm)

  // Aggregate metrics
  let totalPanels = 0
  let totalSilentPanels = 0
  let totalDialoguePanels = 0
  let totalActionPanels = 0

  for (const page of pages) {
    totalPanels += page.panelCount
    totalSilentPanels += page.silentPanels
    totalDialoguePanels += page.dialoguePanels
    totalActionPanels += page.actionPanels
  }

  const avgPanelsPerPage = pages.length > 0
    ? Math.round((totalPanels / pages.length) * 10) / 10
    : 0

  const silentRatio = totalPanels > 0
    ? Math.round((totalSilentPanels / totalPanels) * 1000) / 1000
    : 0

  const dialogueRatio = totalPanels > 0
    ? Math.round((totalDialoguePanels / totalPanels) * 1000) / 1000
    : 0

  const actionRatio = totalPanels > 0
    ? Math.round((totalActionPanels / totalPanels) * 1000) / 1000
    : 0

  // Identify patterns
  const silentSequences = identifySilentSequences(pages)
  const overallTempo = determineOverallTempo(pages)

  // Generate insights
  const insights = generateRhythmInsights(
    pages,
    silentSequences,
    overallTempo,
    silentRatio,
    dialogueRatio
  )

  return {
    pages,
    overallTempo,
    avgPanelsPerPage,
    silentRatio,
    dialogueRatio,
    actionRatio,
    silentSequences,
    insights,
  }
}

// ============================================
// HELPERS
// ============================================

export function getDensityColor(density: PageDensity): string {
  switch (density) {
    case 'sparse': return 'bg-blue-400'
    case 'normal': return 'bg-blue-600'
    case 'dense': return 'bg-blue-800'
  }
}

export function getTempoLabel(tempo: OverallTempo): string {
  const labels: Record<OverallTempo, string> = {
    slow: 'Slow & Deliberate',
    moderate: 'Moderate',
    fast: 'Fast & Dense',
    variable: 'Variable (Good!)',
  }
  return labels[tempo]
}

export function getTempoColor(tempo: OverallTempo): string {
  switch (tempo) {
    case 'slow': return 'text-blue-400'
    case 'moderate': return 'text-gray-400'
    case 'fast': return 'text-red-400'
    case 'variable': return 'text-green-400'
  }
}

export function formatRatio(ratio: number): string {
  return `${Math.round(ratio * 100)}%`
}
