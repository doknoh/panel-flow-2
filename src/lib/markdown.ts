/**
 * Markdown Utilities for Panel Flow
 *
 * Handles parsing, rendering, and manipulation of markdown text
 * specifically for bold (**text**) and italic (*text*) formatting.
 *
 * CRITICAL: This is the foundation for all text formatting features.
 * All features that deal with text must use these utilities to ensure
 * consistent behavior across the application.
 */

import React from 'react'

// =============================================================================
// TYPES
// =============================================================================

export interface MarkdownSegment {
  type: 'text' | 'bold' | 'italic' | 'bold-italic'
  content: string
}

export interface ParsedMarkdown {
  segments: MarkdownSegment[]
  plainText: string
  wordCount: number
}

export interface SelectionRange {
  start: number
  end: number
}

// =============================================================================
// CORE PARSING
// =============================================================================

/**
 * Parse markdown text into segments for rendering
 * Supports: **bold**, *italic*, and ***bold-italic***
 *
 * @example
 * parseMarkdown("I **really** need *this*")
 * // Returns segments: [
 * //   { type: 'text', content: 'I ' },
 * //   { type: 'bold', content: 'really' },
 * //   { type: 'text', content: ' need ' },
 * //   { type: 'italic', content: 'this' }
 * // ]
 */
export function parseMarkdown(text: string): ParsedMarkdown {
  if (!text) {
    return { segments: [], plainText: '', wordCount: 0 }
  }

  const segments: MarkdownSegment[] = []
  let plainText = ''

  // Regex to match markdown patterns
  // Order matters: bold-italic (***) must come before bold (**) and italic (*)
  const pattern = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*)/g

  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    // Add text before this match
    if (match.index > lastIndex) {
      const textContent = text.slice(lastIndex, match.index)
      segments.push({ type: 'text', content: textContent })
      plainText += textContent
    }

    // Determine the type and extract content
    if (match[2]) {
      // Bold-italic (***text***)
      segments.push({ type: 'bold-italic', content: match[2] })
      plainText += match[2]
    } else if (match[3]) {
      // Bold (**text**)
      segments.push({ type: 'bold', content: match[3] })
      plainText += match[3]
    } else if (match[4]) {
      // Italic (*text*)
      segments.push({ type: 'italic', content: match[4] })
      plainText += match[4]
    }

    lastIndex = pattern.lastIndex
  }

  // Add remaining text after last match
  if (lastIndex < text.length) {
    const textContent = text.slice(lastIndex)
    segments.push({ type: 'text', content: textContent })
    plainText += textContent
  }

  // Calculate word count from plain text (no markdown delimiters)
  const wordCount = countWordsFromPlainText(plainText)

  return { segments, plainText, wordCount }
}

/**
 * Strip all markdown syntax from text, returning plain text only
 *
 * @example
 * stripMarkdown("I **really** need *this*")
 * // Returns: "I really need this"
 */
export function stripMarkdown(text: string): string {
  if (!text) return ''
  return parseMarkdown(text).plainText
}

/**
 * Count words in text, automatically stripping markdown first
 *
 * @example
 * countWords("I **really** need *this*")
 * // Returns: 4 (not 6 which would include markdown delimiters)
 */
export function countWords(text: string): number {
  if (!text) return 0
  return parseMarkdown(text).wordCount
}

/**
 * Internal: Count words from already-stripped plain text
 */
function countWordsFromPlainText(plainText: string): number {
  if (!plainText || !plainText.trim()) return 0
  // Split on whitespace and filter empty strings
  return plainText.trim().split(/\s+/).filter(word => word.length > 0).length
}

// =============================================================================
// TEXT MANIPULATION
// =============================================================================

/**
 * Wrap selected text with markdown syntax
 * Handles toggling: if already wrapped, unwraps instead
 *
 * @example
 * wrapSelection("Hello world", 0, 5, '**')
 * // Returns: { text: "**Hello** world", newStart: 0, newEnd: 9 }
 *
 * wrapSelection("**Hello** world", 0, 9, '**')
 * // Returns: { text: "Hello world", newStart: 0, newEnd: 5 } (toggle off)
 */
export function wrapSelection(
  text: string,
  start: number,
  end: number,
  wrapper: '**' | '*'
): { text: string; newStart: number; newEnd: number } {
  // Handle empty or invalid selection
  if (start === end || start < 0 || end > text.length) {
    return { text, newStart: start, newEnd: end }
  }

  const before = text.slice(0, start)
  const selected = text.slice(start, end)
  const after = text.slice(end)

  // Check if selection is already wrapped
  const wrapperLen = wrapper.length
  const alreadyWrapped =
    before.endsWith(wrapper) && after.startsWith(wrapper)

  if (alreadyWrapped) {
    // Toggle off: remove wrapper
    const newBefore = before.slice(0, -wrapperLen)
    const newAfter = after.slice(wrapperLen)
    return {
      text: newBefore + selected + newAfter,
      newStart: start - wrapperLen,
      newEnd: end - wrapperLen
    }
  }

  // Check if the selected text itself contains the wrapper at boundaries
  const selectedHasWrapper =
    selected.startsWith(wrapper) && selected.endsWith(wrapper) &&
    selected.length > wrapperLen * 2

  if (selectedHasWrapper) {
    // Toggle off: remove wrapper from selected text
    const unwrapped = selected.slice(wrapperLen, -wrapperLen)
    return {
      text: before + unwrapped + after,
      newStart: start,
      newEnd: start + unwrapped.length
    }
  }

  // Add wrapper
  return {
    text: before + wrapper + selected + wrapper + after,
    newStart: start,
    newEnd: end + wrapperLen * 2
  }
}

/**
 * Check if text has balanced markdown (all ** and * properly closed)
 */
export function isMarkdownBalanced(text: string): boolean {
  if (!text) return true

  // Count unescaped ** and * markers
  // This is a simplified check - could be more sophisticated
  const boldMatches = text.match(/\*\*[^*]+\*\*/g) || []
  const italicMatches = text.match(/(?<!\*)\*(?!\*)[^*]+\*(?!\*)/g) || []

  // Check for unmatched markers
  let remaining = text
  for (const match of boldMatches) {
    remaining = remaining.replace(match, '')
  }
  for (const match of italicMatches) {
    remaining = remaining.replace(match, '')
  }

  // If there are still * or ** in remaining, it's unbalanced
  const hasUnmatchedBold = /\*\*/.test(remaining)
  const hasUnmatchedItalic = /(?<!\*)\*(?!\*)/.test(remaining)

  return !hasUnmatchedBold && !hasUnmatchedItalic
}

/**
 * Escape text so it won't be interpreted as markdown
 * Useful when user wants literal asterisks
 */
export function escapeMarkdown(text: string): string {
  if (!text) return ''
  return text.replace(/\*/g, '\\*')
}

/**
 * Unescape markdown (convert \* back to *)
 */
export function unescapeMarkdown(text: string): string {
  if (!text) return ''
  return text.replace(/\\\*/g, '*')
}

// =============================================================================
// REACT RENDERING
// =============================================================================

/**
 * Parse markdown and return React nodes for rendering
 *
 * @example
 * // In a component:
 * <p>{parseMarkdownToReact("I **really** need *this*")}</p>
 * // Renders: I <strong>really</strong> need <em>this</em>
 */
export function parseMarkdownToReact(text: string): React.ReactNode[] {
  if (!text) return []

  const { segments } = parseMarkdown(text)

  return segments.map((segment, index) => {
    switch (segment.type) {
      case 'bold':
        return React.createElement('strong', { key: index }, segment.content)
      case 'italic':
        return React.createElement('em', { key: index }, segment.content)
      case 'bold-italic':
        return React.createElement('strong', { key: index },
          React.createElement('em', null, segment.content)
        )
      case 'text':
      default:
        return React.createElement(React.Fragment, { key: index }, segment.content)
    }
  })
}

// =============================================================================
// FIND & REPLACE UTILITIES
// =============================================================================

/**
 * Find text in markdown string, returning position in plain text
 * Accounts for markdown delimiters when calculating positions
 */
export function findInMarkdown(
  text: string,
  searchTerm: string,
  caseSensitive: boolean = false
): number[] {
  if (!text || !searchTerm) return []

  const plainText = stripMarkdown(text)
  const searchIn = caseSensitive ? plainText : plainText.toLowerCase()
  const searchFor = caseSensitive ? searchTerm : searchTerm.toLowerCase()

  const positions: number[] = []
  let pos = 0

  while ((pos = searchIn.indexOf(searchFor, pos)) !== -1) {
    positions.push(pos)
    pos += 1 // Move forward to find overlapping matches
  }

  return positions
}

/**
 * Replace text in markdown string while preserving markdown formatting
 *
 * CRITICAL: This is a complex operation. When replacing text that spans
 * markdown delimiters, we need to be careful not to break the formatting.
 *
 * Strategy:
 * 1. Convert to segments
 * 2. Perform replacement on the content of each segment
 * 3. Reconstruct the markdown string
 */
export function replaceInMarkdown(
  text: string,
  searchTerm: string,
  replacement: string,
  caseSensitive: boolean = false,
  replaceAll: boolean = false
): string {
  if (!text || !searchTerm) return text

  const { segments } = parseMarkdown(text)
  let foundFirst = false

  const newSegments = segments.map(segment => {
    if (!replaceAll && foundFirst) {
      return segment
    }

    const searchIn = caseSensitive ? segment.content : segment.content.toLowerCase()
    const searchFor = caseSensitive ? searchTerm : searchTerm.toLowerCase()

    if (searchIn.includes(searchFor)) {
      foundFirst = true
      // Perform replacement preserving case if not case-sensitive
      let newContent: string
      if (replaceAll) {
        const regex = new RegExp(escapeRegex(searchTerm), caseSensitive ? 'g' : 'gi')
        newContent = segment.content.replace(regex, replacement)
      } else {
        const index = searchIn.indexOf(searchFor)
        newContent = segment.content.slice(0, index) + replacement +
          segment.content.slice(index + searchTerm.length)
      }
      return { ...segment, content: newContent }
    }

    return segment
  })

  // Reconstruct markdown string from segments
  return segmentsToMarkdown(newSegments)
}

/**
 * Convert segments back to markdown string
 */
export function segmentsToMarkdown(segments: MarkdownSegment[]): string {
  return segments.map(segment => {
    switch (segment.type) {
      case 'bold':
        return `**${segment.content}**`
      case 'italic':
        return `*${segment.content}*`
      case 'bold-italic':
        return `***${segment.content}***`
      case 'text':
      default:
        return segment.content
    }
  }).join('')
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// =============================================================================
// WORD COUNT THRESHOLDS
// =============================================================================

export type WordCountSeverity = 'ok' | 'warning' | 'error'

export const WORD_COUNT_THRESHOLDS = {
  WARNING: 25,
  ERROR: 35
} as const

/**
 * Get severity level for a word count
 */
export function getWordCountSeverity(wordCount: number): WordCountSeverity {
  if (wordCount >= WORD_COUNT_THRESHOLDS.ERROR) return 'error'
  if (wordCount >= WORD_COUNT_THRESHOLDS.WARNING) return 'warning'
  return 'ok'
}

/**
 * Get CSS class for word count severity
 */
export function getWordCountClass(wordCount: number): string {
  const severity = getWordCountSeverity(wordCount)
  switch (severity) {
    case 'error':
      return 'text-red-600 dark:text-red-400'
    case 'warning':
      return 'text-yellow-600 dark:text-yellow-400'
    case 'ok':
    default:
      return 'text-green-600 dark:text-green-400'
  }
}

// =============================================================================
// PDF EXPORT UTILITIES
// =============================================================================

/**
 * Interface for PDF rendering context
 * This will be used by exportPdf.ts
 */
export interface PdfTextStyle {
  bold: boolean
  italic: boolean
}

/**
 * Parse markdown into segments suitable for PDF rendering
 * Returns array of { text, style } pairs that can be rendered sequentially
 */
export function parseMarkdownForPdf(text: string): Array<{ text: string; style: PdfTextStyle }> {
  if (!text) return []

  const { segments } = parseMarkdown(text)

  return segments.map(segment => {
    const style: PdfTextStyle = { bold: false, italic: false }

    switch (segment.type) {
      case 'bold':
        style.bold = true
        break
      case 'italic':
        style.italic = true
        break
      case 'bold-italic':
        style.bold = true
        style.italic = true
        break
    }

    return { text: segment.content, style }
  })
}

// =============================================================================
// CLIPBOARD UTILITIES
// =============================================================================

/**
 * Convert markdown to plain text for clipboard (strips formatting)
 */
export function markdownToClipboard(text: string): string {
  return stripMarkdown(text)
}

/**
 * Convert markdown to HTML for rich clipboard
 */
export function markdownToHtml(text: string): string {
  if (!text) return ''

  const { segments } = parseMarkdown(text)

  return segments.map(segment => {
    switch (segment.type) {
      case 'bold':
        return `<strong>${escapeHtml(segment.content)}</strong>`
      case 'italic':
        return `<em>${escapeHtml(segment.content)}</em>`
      case 'bold-italic':
        return `<strong><em>${escapeHtml(segment.content)}</em></strong>`
      case 'text':
      default:
        return escapeHtml(segment.content)
    }
  }).join('')
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
