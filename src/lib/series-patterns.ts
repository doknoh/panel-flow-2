// Cross-Issue Pattern Analysis
// Plotline weaving and character trajectories across the series

// ============================================
// TYPES
// ============================================

export interface PlotlineAssignment {
  issue_id: string
  issue_number: number
  first_appearance: boolean
  climax_issue: boolean
  resolution_issue: boolean
  notes?: string | null
}

export interface Plotline {
  id: string
  name: string
  color: string
  description?: string | null
  plotline_issue_assignments?: PlotlineAssignment[]
}

export interface Character {
  id: string
  name: string
  role?: string | null
}

export interface DialogueBlock {
  character_id?: string | null
  text?: string | null
}

export interface Panel {
  visual_description?: string | null
  dialogue_blocks?: DialogueBlock[]
}

export interface Page {
  page_number: number
  panels?: Panel[]
}

export interface Scene {
  pages?: Page[]
}

export interface Act {
  scenes?: Scene[]
}

export interface Issue {
  id: string
  number: number
  title?: string | null
  acts?: Act[]
}

export interface Series {
  id: string
  title: string
  plotlines?: Plotline[]
  characters?: Character[]
  issues?: Issue[]
}

// Analysis results
export interface PlotlineThread {
  plotlineId: string
  plotlineName: string
  color: string
  appearances: {
    issueNumber: number
    issueId: string
    isFirstAppearance: boolean
    isClimaxIssue: boolean
    isResolutionIssue: boolean
  }[]
  firstIssue: number | null
  lastIssue: number | null
  totalIssues: number
}

export interface CharacterAppearance {
  issueNumber: number
  issueId: string
  dialogueCount: number
  visualMentions: number
  pageCount: number
  totalAppearances: number
}

export interface CharacterTrajectory {
  characterId: string
  characterName: string
  role: string
  appearances: CharacterAppearance[]
  firstIssue: number | null
  lastIssue: number | null
  issuesCovered: number
  gaps: { start: number; end: number; length: number }[]
}

export interface ConvergencePoint {
  issueNumber: number
  issueId: string
  plotlines: string[] // Plotline names
  plotlineCount: number
}

export interface PatternInsight {
  type: 'warning' | 'suggestion' | 'strength' | 'info'
  category: 'plotline' | 'character' | 'structure'
  message: string
  issues?: number[]
  entities?: string[]
}

export interface SeriesPatterns {
  plotlineThreads: PlotlineThread[]
  characterTrajectories: CharacterTrajectory[]
  convergencePoints: ConvergencePoint[]
  insights: PatternInsight[]
}

// ============================================
// PLOTLINE ANALYSIS
// ============================================

/**
 * Calculate plotline threads across the series
 */
export function calculatePlotlineThreads(series: Series): PlotlineThread[] {
  const plotlines = series.plotlines || []
  const threads: PlotlineThread[] = []

  for (const plotline of plotlines) {
    const assignments = plotline.plotline_issue_assignments || []

    // Sort by issue number
    const sortedAssignments = [...assignments].sort((a, b) => a.issue_number - b.issue_number)

    const appearances = sortedAssignments.map(a => ({
      issueNumber: a.issue_number,
      issueId: a.issue_id,
      isFirstAppearance: a.first_appearance,
      isClimaxIssue: a.climax_issue,
      isResolutionIssue: a.resolution_issue,
    }))

    const issueNumbers = appearances.map(a => a.issueNumber)

    threads.push({
      plotlineId: plotline.id,
      plotlineName: plotline.name,
      color: plotline.color,
      appearances,
      firstIssue: issueNumbers.length > 0 ? Math.min(...issueNumbers) : null,
      lastIssue: issueNumbers.length > 0 ? Math.max(...issueNumbers) : null,
      totalIssues: appearances.length,
    })
  }

  return threads
}

// ============================================
// CHARACTER ANALYSIS
// ============================================

/**
 * Count character appearances in an issue
 */
function countCharacterInIssue(
  character: Character,
  issue: Issue
): CharacterAppearance {
  let dialogueCount = 0
  let visualMentions = 0
  const pagesSeen = new Set<number>()

  const characterNameLower = character.name.toLowerCase()

  for (const act of issue.acts || []) {
    for (const scene of act.scenes || []) {
      for (const page of scene.pages || []) {
        let foundOnPage = false

        for (const panel of page.panels || []) {
          // Check dialogue
          for (const dialogue of panel.dialogue_blocks || []) {
            if (dialogue.character_id === character.id) {
              dialogueCount++
              foundOnPage = true
            }
          }

          // Check visual description
          if (panel.visual_description?.toLowerCase().includes(characterNameLower)) {
            visualMentions++
            foundOnPage = true
          }
        }

        if (foundOnPage) {
          pagesSeen.add(page.page_number)
        }
      }
    }
  }

  return {
    issueNumber: issue.number,
    issueId: issue.id,
    dialogueCount,
    visualMentions,
    pageCount: pagesSeen.size,
    totalAppearances: dialogueCount + visualMentions,
  }
}

/**
 * Find gaps in character appearances
 */
function findCharacterGaps(
  appearances: CharacterAppearance[],
  allIssueNumbers: number[]
): { start: number; end: number; length: number }[] {
  const gaps: { start: number; end: number; length: number }[] = []

  if (appearances.length === 0) return gaps

  const presentIssues = new Set(
    appearances
      .filter(a => a.totalAppearances > 0)
      .map(a => a.issueNumber)
  )

  if (presentIssues.size === 0) return gaps

  const minIssue = Math.min(...presentIssues)
  const maxIssue = Math.max(...presentIssues)

  // Only look for gaps between first and last appearance
  let gapStart: number | null = null

  for (const issueNum of allIssueNumbers) {
    if (issueNum < minIssue || issueNum > maxIssue) continue

    if (!presentIssues.has(issueNum)) {
      if (gapStart === null) {
        gapStart = issueNum
      }
    } else {
      if (gapStart !== null) {
        const gapEnd = issueNum - 1
        const length = gapEnd - gapStart + 1
        if (length >= 2) { // Only count gaps of 2+ issues
          gaps.push({ start: gapStart, end: gapEnd, length })
        }
        gapStart = null
      }
    }
  }

  return gaps
}

/**
 * Calculate character trajectory across the series
 */
export function calculateCharacterTrajectory(
  character: Character,
  series: Series
): CharacterTrajectory {
  const issues = series.issues || []
  const sortedIssues = [...issues].sort((a, b) => a.number - b.number)
  const allIssueNumbers = sortedIssues.map(i => i.number)

  const appearances: CharacterAppearance[] = []

  for (const issue of sortedIssues) {
    const appearance = countCharacterInIssue(character, issue)
    appearances.push(appearance)
  }

  const presentAppearances = appearances.filter(a => a.totalAppearances > 0)
  const issueNumbers = presentAppearances.map(a => a.issueNumber)

  const gaps = findCharacterGaps(appearances, allIssueNumbers)

  return {
    characterId: character.id,
    characterName: character.name,
    role: character.role || 'unknown',
    appearances,
    firstIssue: issueNumbers.length > 0 ? Math.min(...issueNumbers) : null,
    lastIssue: issueNumbers.length > 0 ? Math.max(...issueNumbers) : null,
    issuesCovered: presentAppearances.length,
    gaps,
  }
}

/**
 * Calculate all character trajectories
 */
export function calculateAllCharacterTrajectories(series: Series): CharacterTrajectory[] {
  const characters = series.characters || []
  return characters.map(char => calculateCharacterTrajectory(char, series))
}

// ============================================
// CONVERGENCE ANALYSIS
// ============================================

/**
 * Find points where multiple plotlines converge
 */
export function findConvergencePoints(threads: PlotlineThread[]): ConvergencePoint[] {
  const issueToPlotlines = new Map<string, { number: number; id: string; names: string[] }>()

  for (const thread of threads) {
    for (const appearance of thread.appearances) {
      const key = appearance.issueId
      if (!issueToPlotlines.has(key)) {
        issueToPlotlines.set(key, {
          number: appearance.issueNumber,
          id: appearance.issueId,
          names: [],
        })
      }
      issueToPlotlines.get(key)!.names.push(thread.plotlineName)
    }
  }

  // Filter to issues with 2+ plotlines
  const convergencePoints: ConvergencePoint[] = []

  for (const [, data] of issueToPlotlines) {
    if (data.names.length >= 2) {
      convergencePoints.push({
        issueNumber: data.number,
        issueId: data.id,
        plotlines: data.names,
        plotlineCount: data.names.length,
      })
    }
  }

  // Sort by issue number
  convergencePoints.sort((a, b) => a.issueNumber - b.issueNumber)

  return convergencePoints
}

// ============================================
// INSIGHTS GENERATION
// ============================================

/**
 * Generate insights from pattern analysis
 */
export function generatePatternInsights(
  threads: PlotlineThread[],
  trajectories: CharacterTrajectory[],
  convergencePoints: ConvergencePoint[],
  totalIssues: number
): PatternInsight[] {
  const insights: PatternInsight[] = []

  // Plotline insights
  for (const thread of threads) {
    // Short plotlines
    if (thread.totalIssues === 1) {
      insights.push({
        type: 'info',
        category: 'plotline',
        message: `"${thread.plotlineName}" only appears in one issue`,
        issues: thread.appearances.map(a => a.issueNumber),
        entities: [thread.plotlineName],
      })
    }

    // Unresolved plotlines (appears but no resolution marked)
    const hasResolution = thread.appearances.some(a => a.isResolutionIssue)
    if (thread.totalIssues >= 2 && !hasResolution) {
      insights.push({
        type: 'suggestion',
        category: 'plotline',
        message: `"${thread.plotlineName}" has no marked resolution`,
        entities: [thread.plotlineName],
      })
    }

    // Long-running plotlines (strength)
    if (thread.totalIssues >= Math.ceil(totalIssues * 0.6)) {
      insights.push({
        type: 'strength',
        category: 'plotline',
        message: `"${thread.plotlineName}" runs through ${thread.totalIssues}/${totalIssues} issues—strong throughline`,
        entities: [thread.plotlineName],
      })
    }
  }

  // Character insights
  for (const trajectory of trajectories) {
    // Protagonist presence check
    if (trajectory.role === 'protagonist') {
      if (trajectory.issuesCovered < totalIssues) {
        const missingCount = totalIssues - trajectory.issuesCovered
        insights.push({
          type: 'warning',
          category: 'character',
          message: `Protagonist "${trajectory.characterName}" missing from ${missingCount} issue(s)`,
          entities: [trajectory.characterName],
        })
      }
    }

    // Character gaps
    for (const gap of trajectory.gaps) {
      if (gap.length >= 2) {
        insights.push({
          type: 'suggestion',
          category: 'character',
          message: `"${trajectory.characterName}" disappears for ${gap.length} issues (#${gap.start}-#${gap.end})`,
          issues: Array.from({ length: gap.length }, (_, i) => gap.start + i),
          entities: [trajectory.characterName],
        })
      }
    }

    // Sudden appearance (supporting character appears late)
    if (trajectory.role === 'supporting' && trajectory.firstIssue && trajectory.firstIssue > Math.ceil(totalIssues * 0.6)) {
      insights.push({
        type: 'info',
        category: 'character',
        message: `"${trajectory.characterName}" first appears in issue #${trajectory.firstIssue}—late introduction`,
        issues: [trajectory.firstIssue],
        entities: [trajectory.characterName],
      })
    }
  }

  // Convergence insights
  const maxConvergence = convergencePoints.reduce(
    (max, cp) => cp.plotlineCount > max.count ? { count: cp.plotlineCount, issue: cp.issueNumber } : max,
    { count: 0, issue: 0 }
  )

  if (maxConvergence.count >= 3) {
    insights.push({
      type: 'strength',
      category: 'structure',
      message: `${maxConvergence.count} plotlines converge in issue #${maxConvergence.issue}—natural climax point`,
      issues: [maxConvergence.issue],
    })
  }

  // No convergence warning
  if (threads.length >= 2 && convergencePoints.length === 0) {
    insights.push({
      type: 'suggestion',
      category: 'structure',
      message: 'Plotlines don\'t intersect—consider weaving them together',
    })
  }

  return insights
}

// ============================================
// MAIN ANALYSIS FUNCTION
// ============================================

/**
 * Analyze all series patterns
 */
export function analyzeSeriesPatterns(series: Series): SeriesPatterns {
  const issues = series.issues || []
  const totalIssues = issues.length

  // Calculate threads
  const plotlineThreads = calculatePlotlineThreads(series)

  // Calculate trajectories
  const characterTrajectories = calculateAllCharacterTrajectories(series)

  // Find convergence points
  const convergencePoints = findConvergencePoints(plotlineThreads)

  // Generate insights
  const insights = generatePatternInsights(
    plotlineThreads,
    characterTrajectories,
    convergencePoints,
    totalIssues
  )

  return {
    plotlineThreads,
    characterTrajectories,
    convergencePoints,
    insights,
  }
}

// ============================================
// HELPERS
// ============================================

/**
 * Get appearance intensity for visualization (0-3 scale)
 */
export function getAppearanceIntensity(appearance: CharacterAppearance): number {
  const total = appearance.totalAppearances
  if (total === 0) return 0
  if (total <= 3) return 1
  if (total <= 8) return 2
  return 3
}

/**
 * Get intensity color
 */
export function getIntensityColor(intensity: number): string {
  switch (intensity) {
    case 0: return 'bg-gray-800'
    case 1: return 'bg-blue-900'
    case 2: return 'bg-blue-700'
    case 3: return 'bg-blue-500'
    default: return 'bg-gray-800'
  }
}

/**
 * Get insight type color
 */
export function getInsightColor(type: PatternInsight['type']): string {
  switch (type) {
    case 'warning': return 'text-red-400'
    case 'suggestion': return 'text-yellow-400'
    case 'strength': return 'text-green-400'
    case 'info': return 'text-blue-400'
  }
}

/**
 * Get insight type icon
 */
export function getInsightIcon(type: PatternInsight['type']): string {
  switch (type) {
    case 'warning': return '⚠️'
    case 'suggestion': return '💡'
    case 'strength': return '✅'
    case 'info': return 'ℹ️'
  }
}

/**
 * Format issue range for display
 */
export function formatIssueRange(issues: number[]): string {
  if (issues.length === 0) return ''
  if (issues.length === 1) return `#${issues[0]}`

  const sorted = [...issues].sort((a, b) => a - b)
  const ranges: string[] = []
  let rangeStart = sorted[0]
  let rangeEnd = sorted[0]

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === rangeEnd + 1) {
      rangeEnd = sorted[i]
    } else {
      ranges.push(rangeStart === rangeEnd ? `#${rangeStart}` : `#${rangeStart}-${rangeEnd}`)
      rangeStart = sorted[i]
      rangeEnd = sorted[i]
    }
  }
  ranges.push(rangeStart === rangeEnd ? `#${rangeStart}` : `#${rangeStart}-${rangeEnd}`)

  return ranges.join(', ')
}
