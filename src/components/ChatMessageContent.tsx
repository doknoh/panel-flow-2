'use client'

import React from 'react'

interface ChatMessageContentProps {
  content: string
  className?: string
}

/**
 * Renders AI chat message content with basic markdown support.
 * Handles: **bold**, *italic*, `code`, ```code blocks```, headers (#),
 * bullet lists (- / *), numbered lists, and line breaks.
 */
export default function ChatMessageContent({ content, className = '' }: ChatMessageContentProps) {
  const blocks = parseBlocks(content)

  return (
    <div className={`space-y-2 ${className}`}>
      {blocks.map((block, i) => renderBlock(block, i))}
    </div>
  )
}

type Block =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; level: number; text: string }
  | { type: 'code'; lang?: string; code: string }
  | { type: 'list'; ordered: boolean; items: string[] }

function parseBlocks(text: string): Block[] {
  const blocks: Block[] = []
  const lines = text.split('\n')
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Code block
    if (line.trimStart().startsWith('```')) {
      const lang = line.trimStart().slice(3).trim() || undefined
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      blocks.push({ type: 'code', lang, code: codeLines.join('\n') })
      i++ // skip closing ```
      continue
    }

    // Heading
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/)
    if (headingMatch) {
      blocks.push({ type: 'heading', level: headingMatch[1].length, text: headingMatch[2] })
      i++
      continue
    }

    // Unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''))
        i++
      }
      blocks.push({ type: 'list', ordered: false, items })
      continue
    }

    // Ordered list
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ''))
        i++
      }
      blocks.push({ type: 'list', ordered: true, items })
      continue
    }

    // Empty line — skip
    if (line.trim() === '') {
      i++
      continue
    }

    // Paragraph: collect consecutive non-empty, non-special lines
    const paraLines: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].trimStart().startsWith('```') &&
      !lines[i].match(/^#{1,3}\s+/) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+[.)]\s+/.test(lines[i])
    ) {
      paraLines.push(lines[i])
      i++
    }
    if (paraLines.length > 0) {
      blocks.push({ type: 'paragraph', text: paraLines.join('\n') })
    }
  }

  return blocks
}

function renderBlock(block: Block, key: number): React.ReactNode {
  switch (block.type) {
    case 'heading':
      return (
        <p
          key={key}
          className={`font-semibold text-[var(--text-primary)] ${
            block.level === 1 ? 'text-sm' : block.level === 2 ? 'text-[13px]' : 'text-xs'
          }`}
        >
          {renderInline(block.text)}
        </p>
      )

    case 'code':
      return (
        <pre
          key={key}
          className="bg-[var(--bg-primary)] border border-[var(--border)] rounded p-2 text-xs font-mono overflow-x-auto"
        >
          <code>{block.code}</code>
        </pre>
      )

    case 'list':
      const Tag = block.ordered ? 'ol' : 'ul'
      return (
        <Tag
          key={key}
          className={`text-[13px] leading-relaxed space-y-0.5 ${
            block.ordered ? 'list-decimal' : 'list-disc'
          } pl-4`}
        >
          {block.items.map((item, j) => (
            <li key={j}>{renderInline(item)}</li>
          ))}
        </Tag>
      )

    case 'paragraph':
    default:
      return (
        <p key={key} className="text-[13px] leading-relaxed whitespace-pre-wrap">
          {renderInline(block.text)}
        </p>
      )
  }
}

function renderInline(text: string): React.ReactNode {
  // Process inline markdown: **bold**, *italic*, `code`
  const parts: React.ReactNode[] = []
  // Pattern: `code`, **bold**, *italic* (order matters)
  const pattern = /(`[^`]+`|\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*]+\*)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    // Text before match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }

    const m = match[0]
    if (m.startsWith('`')) {
      parts.push(
        <code key={`c-${match.index}`} className="bg-[var(--bg-primary)] px-1 py-0.5 rounded text-xs font-mono">
          {m.slice(1, -1)}
        </code>
      )
    } else if (m.startsWith('***')) {
      parts.push(<strong key={`bi-${match.index}`}><em>{m.slice(3, -3)}</em></strong>)
    } else if (m.startsWith('**')) {
      parts.push(<strong key={`b-${match.index}`}>{m.slice(2, -2)}</strong>)
    } else if (m.startsWith('*')) {
      parts.push(<em key={`i-${match.index}`}>{m.slice(1, -1)}</em>)
    }

    lastIndex = pattern.lastIndex
  }

  // Remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>
}
