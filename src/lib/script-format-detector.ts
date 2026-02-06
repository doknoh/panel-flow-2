/**
 * Smart Format Detection for Comic Script Import
 * Detects various page/panel marker formats used in scripts
 */

export interface FormatPattern {
  name: string
  description: string
  pageRegex: RegExp
  panelRegex: RegExp
  confidence: number // 0-100
  examples: string[]
}

export interface DetectedFormat {
  pattern: FormatPattern
  pageMatches: number
  panelMatches: number
  confidence: number
  sampleMatches: string[]
}

// Common script format patterns
export const FORMAT_PATTERNS: FormatPattern[] = [
  {
    name: 'standard',
    description: 'PAGE 1, PAGE 2, etc.',
    pageRegex: /^[\s]*PAGE[\s]+(\d+)[\s]*(?:\([^)]*\))?[\s]*[:\.]?[\s]*$/gim,
    panelRegex: /^[\s]*PANEL[\s]+(\d+)[\s]*[:\.]?/gim,
    confidence: 100,
    examples: ['PAGE 1', 'PAGE 2 (right)', 'PAGE 12:'],
  },
  {
    name: 'spelled-out',
    description: 'PAGE ONE, PAGE TWO, etc.',
    pageRegex: /^[\s]*PAGE[\s]+(ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN|ELEVEN|TWELVE|THIRTEEN|FOURTEEN|FIFTEEN|SIXTEEN|SEVENTEEN|EIGHTEEN|NINETEEN|TWENTY|TWENTY[- ]?ONE|TWENTY[- ]?TWO)[\s]*[:\.]?[\s]*$/gim,
    panelRegex: /^[\s]*PANEL[\s]+(ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN)[\s]*[:\.]?/gim,
    confidence: 95,
    examples: ['PAGE ONE', 'PAGE TWELVE', 'PANEL THREE:'],
  },
  {
    name: 'abbreviated',
    description: 'Pg. 1, Pg 2, P1, P2',
    pageRegex: /^[\s]*(?:Pg\.?|P)[\s]*(\d+)[\s]*[:\.]?[\s]*$/gim,
    panelRegex: /^[\s]*(?:Pnl\.?|Panel)[\s]*(\d+)[\s]*[:\.]?/gim,
    confidence: 85,
    examples: ['Pg. 1', 'Pg 2', 'P1', 'P12'],
  },
  {
    name: 'bracketed',
    description: '[PAGE 1], [Page 2]',
    pageRegex: /^\[[\s]*(?:PAGE|Page|page)[\s]+(\d+)[\s]*\][\s]*$/gim,
    panelRegex: /^\[[\s]*(?:PANEL|Panel|panel)[\s]+(\d+)[\s]*\]/gim,
    confidence: 90,
    examples: ['[PAGE 1]', '[Page 12]', '[PANEL 3]'],
  },
  {
    name: 'dashed',
    description: '--- PAGE 1 ---',
    pageRegex: /^[\s]*[-=]{2,}[\s]*(?:PAGE|Page)[\s]+(\d+)[\s]*[-=]{2,}[\s]*$/gim,
    panelRegex: /^[\s]*[-=]{2,}[\s]*(?:PANEL|Panel)[\s]+(\d+)[\s]*[-=]{2,}/gim,
    confidence: 80,
    examples: ['--- PAGE 1 ---', '=== Page 12 ==='],
  },
  {
    name: 'hashmarks',
    description: '## PAGE 1, ### Panel 1',
    pageRegex: /^[\s]*#{1,3}[\s]*(?:PAGE|Page)[\s]+(\d+)[\s]*$/gim,
    panelRegex: /^[\s]*#{1,4}[\s]*(?:PANEL|Panel)[\s]+(\d+)/gim,
    confidence: 75,
    examples: ['## PAGE 1', '### Panel 3'],
  },
  {
    name: 'colon-prefix',
    description: 'Page: 1, Panel: 3',
    pageRegex: /^[\s]*(?:PAGE|Page)[\s]*:[\s]*(\d+)[\s]*$/gim,
    panelRegex: /^[\s]*(?:PANEL|Panel)[\s]*:[\s]*(\d+)/gim,
    confidence: 85,
    examples: ['Page: 1', 'PAGE: 12', 'Panel: 3'],
  },
  {
    name: 'screenplay-style',
    description: 'INT. or EXT. scene headers (treats each as a page)',
    pageRegex: /^[\s]*(INT\.|EXT\.|INT\/EXT\.)[\s]+[A-Z][^-\n]*(?:[\s]*-[\s]*[A-Z][^\n]*)?[\s]*$/gim,
    panelRegex: /^[\s]*(\d+)[\s]*[:\.\)]/gim, // Numbered action lines
    confidence: 70,
    examples: ['INT. APARTMENT - DAY', 'EXT. ROOFTOP - NIGHT'],
  },
]

// Word to number mapping for spelled-out formats
const WORD_TO_NUM: Record<string, number> = {
  'ONE': 1, 'TWO': 2, 'THREE': 3, 'FOUR': 4, 'FIVE': 5,
  'SIX': 6, 'SEVEN': 7, 'EIGHT': 8, 'NINE': 9, 'TEN': 10,
  'ELEVEN': 11, 'TWELVE': 12, 'THIRTEEN': 13, 'FOURTEEN': 14, 'FIFTEEN': 15,
  'SIXTEEN': 16, 'SEVENTEEN': 17, 'EIGHTEEN': 18, 'NINETEEN': 19, 'TWENTY': 20,
  'TWENTY-ONE': 21, 'TWENTY ONE': 21, 'TWENTYONE': 21,
  'TWENTY-TWO': 22, 'TWENTY TWO': 22, 'TWENTYTWO': 22,
}

export function wordToNumber(word: string): number {
  const upper = word.toUpperCase().trim()
  return WORD_TO_NUM[upper] || parseInt(upper) || 0
}

/**
 * Detect which format pattern(s) a script uses
 */
export function detectScriptFormat(scriptText: string): DetectedFormat[] {
  const results: DetectedFormat[] = []
  const lines = scriptText.split('\n')

  for (const pattern of FORMAT_PATTERNS) {
    // Reset regex state
    pattern.pageRegex.lastIndex = 0
    pattern.panelRegex.lastIndex = 0

    let pageMatches = 0
    let panelMatches = 0
    const sampleMatches: string[] = []

    // Count page matches
    for (const line of lines) {
      const pageMatch = line.match(new RegExp(pattern.pageRegex.source, 'i'))
      if (pageMatch) {
        pageMatches++
        if (sampleMatches.length < 3) {
          sampleMatches.push(line.trim())
        }
      }

      const panelMatch = line.match(new RegExp(pattern.panelRegex.source, 'i'))
      if (panelMatch) {
        panelMatches++
      }
    }

    if (pageMatches > 0) {
      // Calculate confidence based on matches and base pattern confidence
      const matchBonus = Math.min(pageMatches * 5, 30) // Up to 30% bonus for many matches
      const calculatedConfidence = Math.min(pattern.confidence + matchBonus, 100)

      results.push({
        pattern,
        pageMatches,
        panelMatches,
        confidence: calculatedConfidence,
        sampleMatches,
      })
    }
  }

  // Sort by confidence (highest first)
  results.sort((a, b) => b.confidence - a.confidence)

  return results
}

/**
 * Get the best matching format for a script
 */
export function getBestFormat(scriptText: string): DetectedFormat | null {
  const formats = detectScriptFormat(scriptText)
  return formats.length > 0 ? formats[0] : null
}

/**
 * Extract page numbers using the detected format
 */
export function extractPagesWithFormat(
  scriptText: string,
  format: FormatPattern
): { pageNum: number; content: string; startLine: number }[] {
  const lines = scriptText.split('\n')
  const pages: { pageNum: number; content: string; startLine: number }[] = []
  let currentPage: { pageNum: number; lines: string[]; startLine: number } | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const match = line.match(new RegExp(format.pageRegex.source, 'i'))

    if (match) {
      // Save previous page
      if (currentPage) {
        pages.push({
          pageNum: currentPage.pageNum,
          content: currentPage.lines.join('\n'),
          startLine: currentPage.startLine,
        })
      }

      // Extract page number (handle word or digit)
      const numStr = match[1]
      const pageNum = wordToNumber(numStr)

      currentPage = {
        pageNum,
        lines: [line],
        startLine: i,
      }
    } else if (currentPage) {
      currentPage.lines.push(line)
    }
  }

  // Don't forget last page
  if (currentPage) {
    pages.push({
      pageNum: currentPage.pageNum,
      content: currentPage.lines.join('\n'),
      startLine: currentPage.startLine,
    })
  }

  return pages
}

/**
 * Get confidence label for UI display
 */
export function getConfidenceLabel(confidence: number): string {
  if (confidence >= 90) return 'High confidence'
  if (confidence >= 70) return 'Good match'
  if (confidence >= 50) return 'Possible match'
  return 'Low confidence'
}

/**
 * Get confidence color for UI display
 */
export function getConfidenceColor(confidence: number): string {
  if (confidence >= 90) return 'text-green-400'
  if (confidence >= 70) return 'text-blue-400'
  if (confidence >= 50) return 'text-amber-400'
  return 'text-red-400'
}
