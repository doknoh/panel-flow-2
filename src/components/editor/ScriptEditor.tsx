'use client'

import { useEditor, EditorContent, Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Placeholder from '@tiptap/extension-placeholder'
import CharacterCount from '@tiptap/extension-character-count'
import { Markdown, type MarkdownStorage } from 'tiptap-markdown'
import { useCallback, useEffect, useRef, useState } from 'react'
import ScriptEditorToolbar from './ScriptEditorToolbar'
import { getWordCountClass } from '@/lib/markdown'

type VariantType = 'description' | 'dialogue' | 'caption' | 'sfx' | 'notes'

interface Character {
  id: string
  name: string
  display_name?: string
}

interface ScriptEditorProps {
  variant: VariantType
  initialContent: string
  onUpdate: (markdown: string) => void
  onFocus?: () => void
  onBlur?: (markdown: string) => void
  placeholder?: string
  characters?: Character[]
  showWordCount?: boolean
  className?: string
  editable?: boolean
  speakerColor?: string
  hideToolbar?: boolean
  onEditorFocus?: (editor: Editor) => void
  onEditorBlur?: () => void
  onRegisterEditor?: (editor: Editor) => void
  onUnregisterEditor?: () => void
}

/**
 * ScriptEditor — TipTap-powered rich text editor for comic script writing.
 *
 * Stores content as markdown strings (via tiptap-markdown).
 * All downstream systems (export, AI, auto-format) receive plain markdown.
 *
 * Variants control which toolbar buttons and features are available:
 * - description: Full toolbar, @mention, auto-capitalize
 * - dialogue: Compact (B/I), word count with letterer warnings
 * - caption: Compact (B/I), word count
 * - sfx: No toolbar, single-line behavior
 * - notes: Medium toolbar (B/I/U, lists)
 */
export default function ScriptEditor({
  variant,
  initialContent,
  onUpdate,
  onFocus,
  onBlur,
  placeholder,
  characters,
  showWordCount = false,
  className = '',
  editable = true,
  speakerColor,
  hideToolbar = false,
  onEditorFocus,
  onEditorBlur,
  onRegisterEditor,
  onUnregisterEditor,
}: ScriptEditorProps) {
  const [isFocused, setIsFocused] = useState(false)
  const onUpdateRef = useRef(onUpdate)
  const onBlurRef = useRef(onBlur)
  const onFocusRef = useRef(onFocus)
  const initialContentRef = useRef(initialContent)

  const onEditorFocusRef = useRef(onEditorFocus)
  const onEditorBlurRef = useRef(onEditorBlur)
  const onRegisterEditorRef = useRef(onRegisterEditor)
  const onUnregisterEditorRef = useRef(onUnregisterEditor)

  // Keep refs current without triggering re-renders
  useEffect(() => { onUpdateRef.current = onUpdate }, [onUpdate])
  useEffect(() => { onBlurRef.current = onBlur }, [onBlur])
  useEffect(() => { onFocusRef.current = onFocus }, [onFocus])
  useEffect(() => { onEditorFocusRef.current = onEditorFocus }, [onEditorFocus])
  useEffect(() => { onEditorBlurRef.current = onEditorBlur }, [onEditorBlur])
  useEffect(() => { onRegisterEditorRef.current = onRegisterEditor }, [onRegisterEditor])
  useEffect(() => { onUnregisterEditorRef.current = onUnregisterEditor }, [onUnregisterEditor])

  // Configure extensions based on variant
  const extensions = useCallback(() => {
    const exts = [
      StarterKit.configure({
        // For sfx variant, disable block-level features
        ...(variant === 'sfx' ? {
          heading: false,
          bulletList: false,
          orderedList: false,
          blockquote: false,
          codeBlock: false,
          horizontalRule: false,
        } : {}),
        // For dialogue/caption, disable most block features
        ...(variant === 'dialogue' || variant === 'caption' ? {
          heading: false,
          bulletList: false,
          orderedList: false,
          blockquote: false,
          codeBlock: false,
          horizontalRule: false,
        } : {}),
      }),
      Underline,
      Placeholder.configure({
        placeholder: placeholder || getDefaultPlaceholder(variant),
      }),
      CharacterCount,
      Markdown.configure({
        html: false,
        transformCopiedText: true,
        transformPastedText: true,
      }),
    ]

    return exts
  }, [variant, placeholder])

  const editor = useEditor({
    extensions: extensions(),
    content: initialContent || '',
    editable,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: getEditorClassName(variant, speakerColor),
        'data-variant': variant,
      },
      // For sfx variant, prevent Enter key (single line)
      handleKeyDown: variant === 'sfx' ? (_view, event) => {
        if (event.key === 'Enter') {
          return true // Prevent new line
        }
        return false
      } : undefined,
    },
    onFocus: () => {
      setIsFocused(true)
      onFocusRef.current?.()
    },
    onBlur: ({ editor: ed }) => {
      setIsFocused(false)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const md = ((ed.storage as any).markdown as MarkdownStorage).getMarkdown()
      onBlurRef.current?.(md)
      onEditorBlurRef.current?.()
    },
    onUpdate: ({ editor: ed }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const md = ((ed.storage as any).markdown as MarkdownStorage).getMarkdown()
      onUpdateRef.current(md)
    },
  })

  // Report focused editor instance to parent (for adaptive toolbar)
  useEffect(() => {
    if (isFocused && editor && onEditorFocusRef.current) {
      onEditorFocusRef.current(editor)
    }
  }, [isFocused, editor])

  // Register/unregister editor instance for programmatic focus (tab navigation)
  useEffect(() => {
    if (editor && onRegisterEditorRef.current) {
      onRegisterEditorRef.current(editor)
    }
    return () => {
      if (onUnregisterEditorRef.current) {
        onUnregisterEditorRef.current()
      }
    }
  }, [editor])

  // Update content when initialContent changes externally (e.g., undo/redo)
  useEffect(() => {
    if (!editor) return
    if (initialContent === initialContentRef.current) return
    initialContentRef.current = initialContent

    // Only update if the editor content differs
    const currentMd = getMarkdownFromEditor(editor)
    if (currentMd !== initialContent) {
      editor.commands.setContent(initialContent || '')
    }
  }, [editor, initialContent])

  // Update editable state
  useEffect(() => {
    if (editor) {
      editor.setEditable(editable)
    }
  }, [editor, editable])

  // Word count
  const wordCount = editor?.storage.characterCount.words() ?? 0
  const wordCountClass = getWordCountClass(wordCount)

  if (!editor) return null

  return (
    <div
      className={`script-editor script-editor--${variant} ${className} ${
        isFocused ? 'script-editor--focused' : ''
      }`}
      style={speakerColor ? { '--speaker-color': speakerColor } as React.CSSProperties : undefined}
    >
      {/* Toolbar - shown on focus for compact variants, always for description */}
      {!hideToolbar && variant !== 'sfx' && (variant === 'description' || variant === 'notes' || isFocused) && (
        <ScriptEditorToolbar editor={editor} variant={variant} />
      )}

      {/* Editor */}
      <EditorContent editor={editor} />

      {/* Word count */}
      {showWordCount && (
        <div className={`script-editor__word-count ${wordCountClass}`}>
          {wordCount}w
        </div>
      )}
    </div>
  )
}

/** Helper to get markdown from editor storage (type-safe) */
function getMarkdownFromEditor(editor: ReturnType<typeof useEditor>): string {
  if (!editor) return ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((editor.storage as any).markdown as MarkdownStorage).getMarkdown()
}

function getDefaultPlaceholder(variant: VariantType): string {
  switch (variant) {
    case 'description': return 'Describe what we see in this panel...'
    case 'dialogue': return 'Dialogue text...'
    case 'caption': return 'Caption text...'
    case 'sfx': return 'Sound effect...'
    case 'notes': return 'Notes...'
  }
}

function getEditorClassName(variant: VariantType, speakerColor?: string): string {
  const base = 'script-editor__content'
  const variantClass = `script-editor__content--${variant}`
  const colorClass = speakerColor ? 'script-editor__content--has-speaker-color' : ''
  return `${base} ${variantClass} ${colorClass}`.trim()
}
