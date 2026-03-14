'use client'

import { useEditor, EditorContent, Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Placeholder from '@tiptap/extension-placeholder'
import CharacterCount from '@tiptap/extension-character-count'
import { Markdown, type MarkdownStorage } from 'tiptap-markdown'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Suggestion from '@tiptap/suggestion'
import { Extension } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import ScriptEditorToolbar from './ScriptEditorToolbar'
import { getWordCountClass } from '@/lib/markdown'
import { createMentionSuggestionRenderer, type MentionCharacter } from './MentionSuggestion'

type VariantType = 'description' | 'dialogue' | 'caption' | 'sfx' | 'notes'

interface ScriptEditorProps {
  variant: VariantType
  initialContent: string
  onUpdate: (markdown: string) => void
  onFocus?: () => void
  onBlur?: (markdown: string) => void
  placeholder?: string
  characters?: MentionCharacter[]
  onMentionInsert?: (info: { characterId: string }) => void
  onCharacterClick?: (characterId: string) => void
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
  onMentionInsert,
  onCharacterClick,
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

  // Character mention refs — store in refs so TipTap plugin closures always see current values
  const charactersRef = useRef(characters)
  useEffect(() => { charactersRef.current = characters }, [characters])

  const onMentionInsertRef = useRef(onMentionInsert)
  useEffect(() => { onMentionInsertRef.current = onMentionInsert }, [onMentionInsert])

  const onCharacterClickRef = useRef(onCharacterClick)
  useEffect(() => { onCharacterClickRef.current = onCharacterClick }, [onCharacterClick])

  // Stable suggestion renderer instance — created once, reused across re-renders
  const mentionRendererRef = useRef<ReturnType<typeof createMentionSuggestionRenderer> | null>(null)

  // Build mention suggestion extension — always created so plugin registers at mount time.
  // Uses refs internally so it always sees current characters without needing to re-create.
  const mentionExtension = useMemo(() => {
    return Extension.create({
      name: 'characterMention',

      addProseMirrorPlugins() {
        return [
          Suggestion({
            editor: this.editor,
            char: '@',
            allowSpaces: false,
            startOfLine: false,
            allowedPrefixes: [' ', '\n', '\t', '\0'],
            items: ({ query }: { query: string }) => {
              const currentCharacters = charactersRef.current || []
              if (currentCharacters.length === 0) return []
              const q = query.toLowerCase()
              return currentCharacters
                .filter(c => {
                  const name = (c.display_name || c.name).toLowerCase()
                  const baseName = c.name.toLowerCase()
                  return name.includes(q) || baseName.includes(q)
                })
                .slice(0, 8)
            },
            command: ({ editor, range, props: item }: { editor: any; range: any; props: MentionCharacter }) => {
              const displayName = (item.display_name || item.name).toUpperCase()
              editor
                .chain()
                .focus()
                .deleteRange(range)
                .insertContent({
                  type: 'text',
                  text: displayName,
                  marks: [{ type: 'bold' }],
                })
                .unsetMark('bold')
                .run()

              // Fire fast-path callback for immediate characters_present update
              onMentionInsertRef.current?.({ characterId: item.id })
            },
            render: () => {
              if (!mentionRendererRef.current) {
                mentionRendererRef.current = createMentionSuggestionRenderer()
              }
              return mentionRendererRef.current
            },
          }),
        ]
      },
    })
  }, []) // No deps — always created once, uses refs internally

  // Cmd+Click on bold character names to navigate to character.
  // Always created so plugin registers at mount time; uses refs internally.
  const cmdClickExtension = useMemo(() => {
    return Extension.create({
      name: 'characterCmdClick',

      addProseMirrorPlugins() {
        return [
          new Plugin({
            props: {
              handleClick(_view: any, _pos: number, event: MouseEvent) {
                if (!event.metaKey && !event.ctrlKey) return false

                const target = event.target as HTMLElement
                const boldEl = target.closest('strong') || (target.tagName === 'STRONG' ? target : null)
                if (!boldEl) return false

                const text = boldEl.textContent || ''
                const currentCharacters = charactersRef.current || []
                const match = currentCharacters.find(c => {
                  const displayName = (c.display_name || c.name).toUpperCase()
                  const baseName = c.name.toUpperCase()
                  return text.toUpperCase() === displayName || text.toUpperCase() === baseName
                })

                if (match && onCharacterClickRef.current) {
                  event.preventDefault()
                  onCharacterClickRef.current(match.id)
                  return true
                }

                return false
              },
            },
          }),
        ]
      },
    })
  }, []) // No deps — always created once, uses refs internally

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
      mentionExtension,
      cmdClickExtension,
    ]

    return exts
  }, [variant, placeholder, mentionExtension, cmdClickExtension])

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
    onFocus: ({ editor: ed }) => {
      setIsFocused(true)
      onFocusRef.current?.()
      onEditorFocusRef.current?.(ed)
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

  // Register/unregister editor with parent
  useEffect(() => {
    if (editor) {
      onRegisterEditorRef.current?.(editor)
    }
    return () => {
      onUnregisterEditorRef.current?.()
    }
  }, [editor])

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
