// Pacing analysis utilities for Panel Flow
// Calculates word counts, panel density, and pacing metrics

export interface PanelData {
  id: string
  dialogue?: Array<{ text: string }> | null
  captions?: Array<{ text: string }> | null
  visual_description?: string | null
}

export interface PageData {
  id: string
  page_number: number
  panels: PanelData[]
}

export interface PagePacingMetric {
  pageId: string
  pageNumber: number
  wordCount: number
  panelCount: number
  dialoguePanels: number
  silentPanels: number
  wordsPerPanel: number
  isOddPage: boolean
  warnings: string[]
}

export interface OverallMetrics {
  totalPages: number
  totalPanels: number
  totalWords: number
  totalDialoguePanels: number
  totalSilentPanels: number
  avgWordsPerPage: number
  avgPanelsPerPage: number
  avgWordsPerPanel: number
  dialoguePanelRatio: number
  silentPanelRatio: number
}

export interface PacingInsight {
  type: 'warning' | 'suggestion' | 'strength'
  severity: 'high' | 'medium' | 'low'
  pages: number[]
  message: string
  suggestion?: string
}

export interface PacingAnalysis {
  pages: PagePacingMetric[]
  overall: OverallMetrics
  insights: PacingInsight[]
  score: number
}

// Industry standard thresholds
export const PACING_THRESHOLDS = {
  wordsPerPage: { ideal: { min: 30, max: 100 }, warning: 150 },
  panelsPerPage: { ideal: { min: 4, max: 6 }, cramped: 8, sparse: 3 },
  dialogueRatio: { ideal: { min: 0.4, max: 0.6 }, talking_heads: 0.8 },
  silentRatio: { ideal: { min: 0.1, max: 0.2 }, no_breathing: 0.05 },
  wordsPerPanel: { ideal: { min: 10, max: 25 }, wall_of_text: 40 },
}

/**
 * Count words in a text string
 */
export function countWords(text: string | null | undefined): number {
  if (!text) return 0
  return text.trim().split(/\s+/).filter(w => w.length > 0).length
}

/**
 * Calculate pacing metrics for a single page
 */
export function calculatePageMetrics(page: PageData): PagePacingMetric {
  const panels = page.panels || []

  // Count words from dialogue and captions
  let wordCount = 0
  let dialoguePanels = 0
  let silentPanels = 0

  for (const panel of panels) {
    const dialogueWords = (panel.dialogue || [])
      .reduce((sum, d) => sum + countWords(d.text), 0)
    const captionWords = (panel.captions || [])
      .reduce((sum, c) => sum + countWords(c.text), 0)

    const panelWords = dialogueWords + captionWords
    wordCount += panelWords

    if ((panel.dialogue?.length || 0) > 0) {
      dialoguePanels++
    }

    if (panelWords === 0) {
      silentPanels++
    }
  }

  const panelCount = panels.length
  const wordsPerPanel = panelCount > 0 ? wordCount / panelCount : 0

  // Generate warnings
  const warnings: string[] = []

  if (wordCount > PACING_THRESHOLDS.wordsPerPage.warning) {
    warnings.push('High word count — page may read slowly')
  }

  if (panelCount > PACING_THRESHOLDS.panelsPerPage.cramped) {
    warnings.push('Many panels — page may feel cramped')
  }

  if (panelCount > 0 && panelCount < PACING_THRESHOLDS.panelsPerPage.sparse) {
    warnings.push('Few panels — ensure moment warrants the space')
  }

  if (wordsPerPanel > PACING_THRESHOLDS.wordsPerPanel.wall_of_text) {
    warnings.push('High words per panel — consider splitting dialogue')
  }

  return {
    pageId: page.id,
    pageNumber: page.page_number,
    wordCount,
    panelCount,
    dialoguePanels,
    silentPanels,
    wordsPerPanel: Math.round(wordsPerPanel * 10) / 10,
    isOddPage: page.page_number % 2 === 1,
    warnings,
  }
}

/**
 * Calculate overall metrics from page metrics
 */
export function calculateOverallMetrics(pageMetrics: PagePacingMetric[]): OverallMetrics {
  const totalPages = pageMetrics.length
  const totalPanels = pageMetrics.reduce((sum, p) => sum + p.panelCount, 0)
  const totalWords = pageMetrics.reduce((sum, p) => sum + p.wordCount, 0)
  const totalDialoguePanels = pageMetrics.reduce((sum, p) => sum + p.dialoguePanels, 0)
  const totalSilentPanels = pageMetrics.reduce((sum, p) => sum + p.silentPanels, 0)

  return {
    totalPages,
    totalPanels,
    totalWords,
    totalDialoguePanels,
    totalSilentPanels,
    avgWordsPerPage: totalPages > 0 ? Math.round((totalWords / totalPages) * 10) / 10 : 0,
    avgPanelsPerPage: totalPages > 0 ? Math.round((totalPanels / totalPages) * 10) / 10 : 0,
    avgWordsPerPanel: totalPanels > 0 ? Math.round((totalWords / totalPanels) * 10) / 10 : 0,
    dialoguePanelRatio: totalPanels > 0 ? Math.round((totalDialoguePanels / totalPanels) * 100) / 100 : 0,
    silentPanelRatio: totalPanels > 0 ? Math.round((totalSilentPanels / totalPanels) * 100) / 100 : 0,
  }
}

/**
 * Generate automatic insights based on metrics (non-AI)
 */
export function generateInsights(
  pageMetrics: PagePacingMetric[],
  overall: OverallMetrics
): PacingInsight[] {
  const insights: PacingInsight[] = []

  // Check for high word count pages
  const highWordPages = pageMetrics.filter(p => p.wordCount > PACING_THRESHOLDS.wordsPerPage.warning)
  if (highWordPages.length > 0) {
    insights.push({
      type: 'warning',
      severity: highWordPages.length > 3 ? 'high' : 'medium',
      pages: highWordPages.map(p => p.pageNumber),
      message: `${highWordPages.length} page(s) have over 150 words — may read slowly`,
      suggestion: 'Consider splitting dialogue or adding visual beats to these pages',
    })
  }

  // Check for cramped pages
  const crampedPages = pageMetrics.filter(p => p.panelCount > PACING_THRESHOLDS.panelsPerPage.cramped)
  if (crampedPages.length > 0) {
    insights.push({
      type: 'warning',
      severity: 'medium',
      pages: crampedPages.map(p => p.pageNumber),
      message: `${crampedPages.length} page(s) have ${PACING_THRESHOLDS.panelsPerPage.cramped}+ panels — may feel cramped`,
      suggestion: 'Consider spreading content across more pages for readability',
    })
  }

  // Check for sparse pages (excluding intentional splash pages)
  const sparsePages = pageMetrics.filter(p => p.panelCount > 0 && p.panelCount < PACING_THRESHOLDS.panelsPerPage.sparse)
  if (sparsePages.length > 2) {
    insights.push({
      type: 'suggestion',
      severity: 'low',
      pages: sparsePages.map(p => p.pageNumber),
      message: `${sparsePages.length} pages have fewer than 3 panels`,
      suggestion: 'Ensure these moments warrant the space — splash pages work best for key reveals',
    })
  }

  // Check dialogue ratio
  if (overall.dialoguePanelRatio > PACING_THRESHOLDS.dialogueRatio.talking_heads) {
    // Find consecutive dialogue-heavy pages
    const dialogueHeavySequences: number[][] = []
    let currentSequence: number[] = []

    for (const page of pageMetrics) {
      const pageDialogueRatio = page.panelCount > 0 ? page.dialoguePanels / page.panelCount : 0
      if (pageDialogueRatio > 0.7) {
        currentSequence.push(page.pageNumber)
      } else if (currentSequence.length > 0) {
        if (currentSequence.length >= 2) {
          dialogueHeavySequences.push([...currentSequence])
        }
        currentSequence = []
      }
    }
    if (currentSequence.length >= 2) {
      dialogueHeavySequences.push(currentSequence)
    }

    if (dialogueHeavySequences.length > 0) {
      const allPages = dialogueHeavySequences.flat()
      insights.push({
        type: 'warning',
        severity: 'high',
        pages: allPages,
        message: `Dialogue-heavy sequences detected — risk of "talking heads"`,
        suggestion: 'Break up with action beats, visual variety, or silent panels',
      })
    }
  }

  // Check for lack of breathing room
  if (overall.silentPanelRatio < PACING_THRESHOLDS.silentRatio.no_breathing) {
    insights.push({
      type: 'suggestion',
      severity: 'medium',
      pages: [],
      message: `Only ${Math.round(overall.silentPanelRatio * 100)}% silent panels — consider adding breathing room`,
      suggestion: 'Silent panels let readers absorb emotional moments and vary the rhythm',
    })
  }

  // Check for good page-turn hooks on odd pages
  const oddPagesWithoutHooks = pageMetrics
    .filter(p => p.isOddPage && p.pageNumber < pageMetrics.length)
    .filter(p => p.wordCount < 20 && p.panelCount <= 2)

  if (oddPagesWithoutHooks.length === 0 && pageMetrics.length > 4) {
    insights.push({
      type: 'strength',
      severity: 'low',
      pages: [],
      message: 'Good page density on odd-numbered pages',
      suggestion: 'Strong content on odd pages creates natural page-turn hooks',
    })
  }

  // Positive insights
  if (overall.avgWordsPerPage >= 30 && overall.avgWordsPerPage <= 100) {
    insights.push({
      type: 'strength',
      severity: 'low',
      pages: [],
      message: `Average ${overall.avgWordsPerPage} words/page — well within ideal range`,
    })
  }

  if (overall.avgPanelsPerPage >= 4 && overall.avgPanelsPerPage <= 6) {
    insights.push({
      type: 'strength',
      severity: 'low',
      pages: [],
      message: `Average ${overall.avgPanelsPerPage} panels/page — optimal panel density`,
    })
  }

  return insights
}

/**
 * Calculate overall pacing score (1-100)
 */
export function calculatePacingScore(
  overall: OverallMetrics,
  insights: PacingInsight[]
): number {
  let score = 75 // Base score

  // Penalize for warnings
  const warnings = insights.filter(i => i.type === 'warning')
  const highSeverity = warnings.filter(i => i.severity === 'high').length
  const mediumSeverity = warnings.filter(i => i.severity === 'medium').length

  score -= highSeverity * 15
  score -= mediumSeverity * 8

  // Reward for strengths
  const strengths = insights.filter(i => i.type === 'strength')
  score += strengths.length * 5

  // Bonus for ideal ranges
  if (overall.avgWordsPerPage >= 30 && overall.avgWordsPerPage <= 100) score += 5
  if (overall.avgPanelsPerPage >= 4 && overall.avgPanelsPerPage <= 6) score += 5
  if (overall.dialoguePanelRatio >= 0.4 && overall.dialoguePanelRatio <= 0.6) score += 5
  if (overall.silentPanelRatio >= 0.1 && overall.silentPanelRatio <= 0.2) score += 5

  return Math.max(1, Math.min(100, score))
}

/**
 * Run full pacing analysis on issue pages
 */
export function analyzePacing(pages: PageData[]): PacingAnalysis {
  // Sort pages by page_number
  const sortedPages = [...pages].sort((a, b) => a.page_number - b.page_number)

  // Calculate per-page metrics
  const pageMetrics = sortedPages.map(calculatePageMetrics)

  // Calculate overall metrics
  const overall = calculateOverallMetrics(pageMetrics)

  // Generate insights
  const insights = generateInsights(pageMetrics, overall)

  // Calculate score
  const score = calculatePacingScore(overall, insights)

  return {
    pages: pageMetrics,
    overall,
    insights,
    score,
  }
}

/**
 * Get color for pacing score
 */
export function getScoreColor(score: number): string {
  if (score >= 80) return 'text-green-500'
  if (score >= 60) return 'text-yellow-500'
  if (score >= 40) return 'text-orange-500'
  return 'text-red-500'
}

/**
 * Get label for pacing score
 */
export function getScoreLabel(score: number): string {
  if (score >= 90) return 'Excellent'
  if (score >= 80) return 'Great'
  if (score >= 70) return 'Good'
  if (score >= 60) return 'Fair'
  if (score >= 50) return 'Needs Work'
  return 'Review Needed'
}
