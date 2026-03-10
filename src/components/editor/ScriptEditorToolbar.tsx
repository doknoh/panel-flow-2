'use client'

import type { Editor } from '@tiptap/react'

type VariantType = 'description' | 'dialogue' | 'caption' | 'sfx' | 'notes'

interface ScriptEditorToolbarProps {
  editor: Editor
  variant: VariantType
}

interface ToolbarButton {
  label: string
  icon: string
  action: () => void
  isActive: () => boolean
  title: string
}

export default function ScriptEditorToolbar({ editor, variant }: ScriptEditorToolbarProps) {
  if (variant === 'sfx') return null

  const boldBtn: ToolbarButton = {
    label: 'Bold',
    icon: 'B',
    action: () => editor.chain().focus().toggleBold().run(),
    isActive: () => editor.isActive('bold'),
    title: 'Bold (⌘B)',
  }

  const italicBtn: ToolbarButton = {
    label: 'Italic',
    icon: 'I',
    action: () => editor.chain().focus().toggleItalic().run(),
    isActive: () => editor.isActive('italic'),
    title: 'Italic (⌘I)',
  }

  const underlineBtn: ToolbarButton = {
    label: 'Underline',
    icon: 'U',
    action: () => editor.chain().focus().toggleUnderline().run(),
    isActive: () => editor.isActive('underline'),
    title: 'Underline (⌘U)',
  }

  const strikeBtn: ToolbarButton = {
    label: 'Strikethrough',
    icon: 'S',
    action: () => editor.chain().focus().toggleStrike().run(),
    isActive: () => editor.isActive('strike'),
    title: 'Strikethrough (⌘⇧X)',
  }

  const bulletListBtn: ToolbarButton = {
    label: 'Bullet List',
    icon: '•',
    action: () => editor.chain().focus().toggleBulletList().run(),
    isActive: () => editor.isActive('bulletList'),
    title: 'Bullet List',
  }

  const orderedListBtn: ToolbarButton = {
    label: 'Numbered List',
    icon: '1.',
    action: () => editor.chain().focus().toggleOrderedList().run(),
    isActive: () => editor.isActive('orderedList'),
    title: 'Numbered List',
  }

  const headingBtn: ToolbarButton = {
    label: 'Heading',
    icon: 'H',
    action: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
    isActive: () => editor.isActive('heading'),
    title: 'Heading',
  }

  const blockquoteBtn: ToolbarButton = {
    label: 'Quote',
    icon: '❝',
    action: () => editor.chain().focus().toggleBlockquote().run(),
    isActive: () => editor.isActive('blockquote'),
    title: 'Blockquote',
  }

  const codeBlockBtn: ToolbarButton = {
    label: 'Code',
    icon: '<>',
    action: () => editor.chain().focus().toggleCodeBlock().run(),
    isActive: () => editor.isActive('codeBlock'),
    title: 'Code Block',
  }

  const hrBtn: ToolbarButton = {
    label: 'Divider',
    icon: '—',
    action: () => editor.chain().focus().setHorizontalRule().run(),
    isActive: () => false,
    title: 'Horizontal Rule',
  }

  // Build button list based on variant
  let buttons: ToolbarButton[]
  switch (variant) {
    case 'dialogue':
    case 'caption':
      buttons = [boldBtn, italicBtn]
      break
    case 'notes':
      buttons = [boldBtn, italicBtn, underlineBtn, bulletListBtn, orderedListBtn]
      break
    case 'description':
    default:
      buttons = [
        boldBtn, italicBtn, underlineBtn, strikeBtn,
        bulletListBtn, orderedListBtn,
        headingBtn, blockquoteBtn, codeBlockBtn, hrBtn,
      ]
      break
  }

  // Group buttons with separators
  const getGroups = (): ToolbarButton[][] => {
    switch (variant) {
      case 'dialogue':
      case 'caption':
        return [buttons]
      case 'notes':
        return [[boldBtn, italicBtn, underlineBtn], [bulletListBtn, orderedListBtn]]
      case 'description':
      default:
        return [
          [boldBtn, italicBtn, underlineBtn, strikeBtn],
          [bulletListBtn, orderedListBtn],
          [headingBtn, blockquoteBtn, codeBlockBtn, hrBtn],
        ]
    }
  }

  const groups = getGroups()

  return (
    <div className="flex items-center gap-0.5 py-1 px-1 border-b border-[var(--border)] bg-[var(--bg-tertiary)]/50">
      {groups.map((group, gi) => (
        <div key={gi} className="flex items-center gap-0.5">
          {gi > 0 && (
            <div className="w-px h-4 bg-[var(--border)] mx-1" />
          )}
          {group.map((btn) => (
            <button
              key={btn.label}
              type="button"
              onClick={btn.action}
              title={btn.title}
              aria-label={btn.title}
              className={`px-1.5 py-0.5 text-xs font-medium rounded transition-colors ${
                btn.isActive()
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
              }`}
            >
              {btn.icon === 'B' ? <strong>{btn.icon}</strong>
                : btn.icon === 'I' ? <em>{btn.icon}</em>
                : btn.icon === 'U' ? <u>{btn.icon}</u>
                : btn.icon === 'S' ? <s>{btn.icon}</s>
                : btn.icon}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}
