'use client'

import React, { useRef, useCallback, useEffect, useState } from 'react'
import { wrapSelection, parseMarkdownToReact, countWords, getWordCountClass } from '@/lib/markdown'

interface RichTextEditorProps {
  value: string
  onChange: (value: string) => void
  onFocus?: () => void
  onBlur?: () => void
  placeholder?: string
  className?: string
  style?: React.CSSProperties
  showWordCount?: boolean
  wordCountPosition?: 'top' | 'bottom' | 'inline'
  registerRef?: (el: HTMLTextAreaElement | null) => void
  minHeight?: string
  autoResize?: boolean
  disabled?: boolean
}

/**
 * RichTextEditor - A markdown-aware text editor for Panel Flow
 *
 * Features:
 * - Cmd+B for bold (**text**)
 * - Cmd+I for italic (*text*)
 * - Real-time word count with color thresholds
 * - Auto-resize based on content
 * - Visual markdown preview (optional)
 *
 * The editor stores text as plain markdown (e.g., "I **really** need *this*")
 * and can optionally render a preview of the formatted text.
 */
export default function RichTextEditor({
  value,
  onChange,
  onFocus,
  onBlur,
  placeholder,
  className = '',
  style,
  showWordCount = false,
  wordCountPosition = 'inline',
  registerRef,
  minHeight = '40px',
  autoResize = true,
  disabled = false
}: RichTextEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [isFocused, setIsFocused] = useState(false)

  // Register ref with parent if provided
  useEffect(() => {
    if (registerRef && textareaRef.current) {
      registerRef(textareaRef.current)
    }
  }, [registerRef])

  // Auto-resize textarea based on content
  useEffect(() => {
    if (autoResize && textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.max(
        parseInt(minHeight),
        textareaRef.current.scrollHeight
      )}px`
    }
  }, [value, autoResize, minHeight])

  /**
   * Handle keyboard shortcuts for formatting
   */
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const isMod = e.metaKey || e.ctrlKey
    const textarea = textareaRef.current

    if (!textarea) return

    // Cmd+B for bold
    if (isMod && e.key === 'b') {
      e.preventDefault()
      applyFormatting('**')
      return
    }

    // Cmd+I for italic
    if (isMod && e.key === 'i') {
      e.preventDefault()
      applyFormatting('*')
      return
    }
  }, [value, onChange])

  /**
   * Apply bold or italic formatting to selected text
   */
  const applyFormatting = useCallback((wrapper: '**' | '*') => {
    const textarea = textareaRef.current
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd

    // If no selection, we'll wrap the current word
    let actualStart = start
    let actualEnd = end

    if (start === end) {
      // No selection - find word boundaries
      const text = value
      let wordStart = start
      let wordEnd = end

      // Find word start (go backwards until space or start)
      while (wordStart > 0 && !/\s/.test(text[wordStart - 1])) {
        wordStart--
      }

      // Find word end (go forwards until space or end)
      while (wordEnd < text.length && !/\s/.test(text[wordEnd])) {
        wordEnd++
      }

      actualStart = wordStart
      actualEnd = wordEnd
    }

    const result = wrapSelection(value, actualStart, actualEnd, wrapper)

    onChange(result.text)

    // Restore cursor position after React re-renders
    requestAnimationFrame(() => {
      if (textarea) {
        textarea.focus()
        textarea.setSelectionRange(result.newStart, result.newEnd)
      }
    })
  }, [value, onChange])

  const handleFocus = useCallback(() => {
    setIsFocused(true)
    onFocus?.()
  }, [onFocus])

  const handleBlur = useCallback(() => {
    setIsFocused(false)
    onBlur?.()
  }, [onBlur])

  const wordCount = showWordCount ? countWords(value) : 0
  const wordCountColorClass = getWordCountClass(wordCount)

  // Render word count badge
  const renderWordCount = () => {
    if (!showWordCount) return null

    return (
      <span
        className={`text-xs font-mono ${wordCountColorClass} ${
          wordCountPosition === 'inline' ? 'ml-2' : ''
        }`}
        title={`${wordCount} words${wordCount >= 35 ? ' (too many for letterer!)' : wordCount >= 25 ? ' (getting wordy)' : ''}`}
      >
        {wordCount}w
      </span>
    )
  }

  return (
    <div className="relative">
      {wordCountPosition === 'top' && showWordCount && (
        <div className="flex justify-end mb-1">
          {renderWordCount()}
        </div>
      )}

      <div className="relative">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={disabled}
          className={`${className} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          style={{
            ...style,
            minHeight
          }}
        />

        {wordCountPosition === 'inline' && showWordCount && isFocused && (
          <div className="absolute right-2 top-1">
            {renderWordCount()}
          </div>
        )}
      </div>

      {wordCountPosition === 'bottom' && showWordCount && (
        <div className="flex justify-end mt-1">
          {renderWordCount()}
        </div>
      )}
    </div>
  )
}

/**
 * FormattingToolbar - Optional toolbar for users who prefer buttons
 */
interface FormattingToolbarProps {
  onBold: () => void
  onItalic: () => void
  className?: string
}

export function FormattingToolbar({ onBold, onItalic, className = '' }: FormattingToolbarProps) {
  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <button
        type="button"
        onClick={onBold}
        className="p-1 text-xs text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
        title="Bold (Cmd+B)"
      >
        <strong>B</strong>
      </button>
      <button
        type="button"
        onClick={onItalic}
        className="p-1 text-xs text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
        title="Italic (Cmd+I)"
      >
        <em>I</em>
      </button>
    </div>
  )
}

/**
 * MarkdownPreview - Renders markdown text as formatted output
 */
interface MarkdownPreviewProps {
  text: string
  className?: string
}

export function MarkdownPreview({ text, className = '' }: MarkdownPreviewProps) {
  const rendered = parseMarkdownToReact(text)

  return (
    <div className={className}>
      {rendered}
    </div>
  )
}

/**
 * WordCountBadge - Standalone word count display
 */
interface WordCountBadgeProps {
  text: string
  className?: string
}

export function WordCountBadge({ text, className = '' }: WordCountBadgeProps) {
  const wordCount = countWords(text)
  const colorClass = getWordCountClass(wordCount)

  return (
    <span
      className={`text-xs font-mono ${colorClass} ${className}`}
      title={`${wordCount} words${wordCount >= 35 ? ' (too many!)' : wordCount >= 25 ? ' (warning)' : ''}`}
    >
      {wordCount}w
    </span>
  )
}
