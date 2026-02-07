/**
 * Version Diff Utilities
 *
 * Compares old and new content, generating a visual diff
 * for reviewing changes during script import or editing.
 */

export interface DiffLine {
  type: 'unchanged' | 'added' | 'removed' | 'modified'
  lineNumber: number
  oldLineNumber?: number
  newLineNumber?: number
  content: string
  oldContent?: string
}

export interface DiffResult {
  lines: DiffLine[]
  stats: {
    added: number
    removed: number
    modified: number
    unchanged: number
  }
  similarity: number // 0-100 percentage
}

export interface PageDiff {
  pageNumber: number
  oldPanelCount: number
  newPanelCount: number
  status: 'new' | 'modified' | 'unchanged' | 'removed'
  panels: PanelDiff[]
}

export interface PanelDiff {
  panelNumber: number
  status: 'new' | 'modified' | 'unchanged' | 'removed'
  visualDiff?: DiffResult
  dialogueDiff?: DialogueDiff[]
}

export interface DialogueDiff {
  character: string
  status: 'new' | 'modified' | 'unchanged' | 'removed'
  oldText?: string
  newText?: string
}

/**
 * Compute line-by-line diff between two texts
 */
export function computeLineDiff(oldText: string, newText: string): DiffResult {
  const oldLines = oldText.split('\n')
  const newLines = newText.split('\n')

  // Use LCS (Longest Common Subsequence) for diff
  const lcs = longestCommonSubsequence(oldLines, newLines)
  const lines: DiffLine[] = []

  let oldIdx = 0
  let newIdx = 0
  let oldLineNum = 1
  let newLineNum = 1

  let stats = { added: 0, removed: 0, modified: 0, unchanged: 0 }

  for (const common of lcs) {
    // Add removed lines (in old but not in common)
    while (oldIdx < oldLines.indexOf(common, oldIdx)) {
      // Check if this line was modified (similar line exists in new)
      const similarIdx = findSimilarLine(oldLines[oldIdx], newLines.slice(newIdx))
      if (similarIdx >= 0 && similarIdx < 3) {
        // Modified line
        lines.push({
          type: 'modified',
          lineNumber: newLineNum + similarIdx,
          oldLineNumber: oldLineNum,
          newLineNumber: newLineNum + similarIdx,
          content: newLines[newIdx + similarIdx],
          oldContent: oldLines[oldIdx]
        })
        stats.modified++
      } else {
        lines.push({
          type: 'removed',
          lineNumber: oldLineNum,
          oldLineNumber: oldLineNum,
          content: oldLines[oldIdx]
        })
        stats.removed++
      }
      oldIdx++
      oldLineNum++
    }

    // Add added lines (in new but not in common)
    while (newIdx < newLines.indexOf(common, newIdx)) {
      if (!lines.some(l => l.type === 'modified' && l.content === newLines[newIdx])) {
        lines.push({
          type: 'added',
          lineNumber: newLineNum,
          newLineNumber: newLineNum,
          content: newLines[newIdx]
        })
        stats.added++
      }
      newIdx++
      newLineNum++
    }

    // Add common line
    lines.push({
      type: 'unchanged',
      lineNumber: newLineNum,
      oldLineNumber: oldLineNum,
      newLineNumber: newLineNum,
      content: common
    })
    stats.unchanged++

    oldIdx++
    newIdx++
    oldLineNum++
    newLineNum++
  }

  // Handle remaining lines
  while (oldIdx < oldLines.length) {
    lines.push({
      type: 'removed',
      lineNumber: oldLineNum,
      oldLineNumber: oldLineNum,
      content: oldLines[oldIdx]
    })
    stats.removed++
    oldIdx++
    oldLineNum++
  }

  while (newIdx < newLines.length) {
    lines.push({
      type: 'added',
      lineNumber: newLineNum,
      newLineNumber: newLineNum,
      content: newLines[newIdx]
    })
    stats.added++
    newIdx++
    newLineNum++
  }

  const totalLines = stats.added + stats.removed + stats.modified + stats.unchanged
  const similarity = totalLines > 0
    ? Math.round((stats.unchanged / totalLines) * 100)
    : 100

  return { lines, stats, similarity }
}

/**
 * Simple LCS algorithm for strings
 */
function longestCommonSubsequence(arr1: string[], arr2: string[]): string[] {
  const m = arr1.length
  const n = arr2.length
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0))

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (arr1[i - 1] === arr2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  // Backtrack to find the actual LCS
  const result: string[] = []
  let i = m, j = n
  while (i > 0 && j > 0) {
    if (arr1[i - 1] === arr2[j - 1]) {
      result.unshift(arr1[i - 1])
      i--
      j--
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--
    } else {
      j--
    }
  }

  return result
}

/**
 * Find a similar line using fuzzy matching
 */
function findSimilarLine(target: string, candidates: string[]): number {
  const targetLower = target.toLowerCase().trim()
  if (!targetLower) return -1

  for (let i = 0; i < candidates.length; i++) {
    const candidateLower = candidates[i].toLowerCase().trim()
    if (!candidateLower) continue

    // Check similarity ratio
    const similarity = stringSimilarity(targetLower, candidateLower)
    if (similarity > 0.6) { // 60% similar
      return i
    }
  }

  return -1
}

/**
 * Simple string similarity (Dice coefficient)
 */
function stringSimilarity(s1: string, s2: string): number {
  if (s1 === s2) return 1
  if (s1.length < 2 || s2.length < 2) return 0

  const bigrams1 = new Set<string>()
  for (let i = 0; i < s1.length - 1; i++) {
    bigrams1.add(s1.slice(i, i + 2))
  }

  let intersection = 0
  for (let i = 0; i < s2.length - 1; i++) {
    if (bigrams1.has(s2.slice(i, i + 2))) {
      intersection++
    }
  }

  return (2 * intersection) / (s1.length + s2.length - 2)
}

/**
 * Compare parsed pages for structural diff
 */
export function comparePages(
  oldPages: Array<{ pageNumber: number; panels: any[] }>,
  newPages: Array<{ pageNumber: number; panels: any[] }>
): PageDiff[] {
  const diffs: PageDiff[] = []
  const maxPages = Math.max(oldPages.length, newPages.length)

  for (let i = 0; i < maxPages; i++) {
    const oldPage = oldPages[i]
    const newPage = newPages[i]

    if (!oldPage && newPage) {
      // New page
      diffs.push({
        pageNumber: newPage.pageNumber,
        oldPanelCount: 0,
        newPanelCount: newPage.panels.length,
        status: 'new',
        panels: newPage.panels.map((p, idx) => ({
          panelNumber: idx + 1,
          status: 'new' as const
        }))
      })
    } else if (oldPage && !newPage) {
      // Removed page
      diffs.push({
        pageNumber: oldPage.pageNumber,
        oldPanelCount: oldPage.panels.length,
        newPanelCount: 0,
        status: 'removed',
        panels: oldPage.panels.map((p, idx) => ({
          panelNumber: idx + 1,
          status: 'removed' as const
        }))
      })
    } else if (oldPage && newPage) {
      // Compare panels
      const panelDiffs = comparePanels(oldPage.panels, newPage.panels)
      const hasChanges = panelDiffs.some(p => p.status !== 'unchanged')

      diffs.push({
        pageNumber: newPage.pageNumber,
        oldPanelCount: oldPage.panels.length,
        newPanelCount: newPage.panels.length,
        status: hasChanges ? 'modified' : 'unchanged',
        panels: panelDiffs
      })
    }
  }

  return diffs
}

/**
 * Compare panels within a page
 */
function comparePanels(oldPanels: any[], newPanels: any[]): PanelDiff[] {
  const diffs: PanelDiff[] = []
  const maxPanels = Math.max(oldPanels.length, newPanels.length)

  for (let i = 0; i < maxPanels; i++) {
    const oldPanel = oldPanels[i]
    const newPanel = newPanels[i]

    if (!oldPanel && newPanel) {
      diffs.push({
        panelNumber: i + 1,
        status: 'new'
      })
    } else if (oldPanel && !newPanel) {
      diffs.push({
        panelNumber: i + 1,
        status: 'removed'
      })
    } else if (oldPanel && newPanel) {
      // Compare visual descriptions
      const oldVisual = oldPanel.visual_description || oldPanel.visualDescription || ''
      const newVisual = newPanel.visual_description || newPanel.visualDescription || ''

      if (oldVisual !== newVisual) {
        diffs.push({
          panelNumber: i + 1,
          status: 'modified',
          visualDiff: computeLineDiff(oldVisual, newVisual)
        })
      } else {
        diffs.push({
          panelNumber: i + 1,
          status: 'unchanged'
        })
      }
    }
  }

  return diffs
}

/**
 * Generate summary of changes
 */
export function generateDiffSummary(pageDiffs: PageDiff[]): string {
  const newPages = pageDiffs.filter(p => p.status === 'new').length
  const modifiedPages = pageDiffs.filter(p => p.status === 'modified').length
  const removedPages = pageDiffs.filter(p => p.status === 'removed').length
  const unchangedPages = pageDiffs.filter(p => p.status === 'unchanged').length

  const parts: string[] = []

  if (newPages > 0) parts.push(`${newPages} new page${newPages > 1 ? 's' : ''}`)
  if (modifiedPages > 0) parts.push(`${modifiedPages} modified`)
  if (removedPages > 0) parts.push(`${removedPages} removed`)
  if (unchangedPages > 0) parts.push(`${unchangedPages} unchanged`)

  return parts.join(', ') || 'No changes'
}

/**
 * Get color for diff status
 */
export function getDiffStatusColor(status: 'new' | 'modified' | 'unchanged' | 'removed'): string {
  switch (status) {
    case 'new': return 'text-green-400'
    case 'modified': return 'text-amber-400'
    case 'removed': return 'text-red-400'
    case 'unchanged': return 'text-[var(--text-secondary)]'
  }
}

/**
 * Get background color for diff type
 */
export function getDiffBgColor(type: 'added' | 'removed' | 'modified' | 'unchanged'): string {
  switch (type) {
    case 'added': return 'bg-green-500/20'
    case 'removed': return 'bg-red-500/20'
    case 'modified': return 'bg-amber-500/20'
    case 'unchanged': return ''
  }
}
