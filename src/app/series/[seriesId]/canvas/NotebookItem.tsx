'use client'

import { useState, useRef, useEffect } from 'react'
import { Tip } from '@/components/ui/Tip'
import { CanvasItemData, ColorTag, COLOR_OPTIONS, FilingTarget, ITEM_TYPE_CONFIG, ITEM_TYPE_ICONS } from './NotebookClient'

const COLOR_CLASSES: Record<ColorTag, string> = {
  red: 'border-l-red-500',
  orange: 'border-l-orange-500',
  yellow: 'border-l-yellow-500',
  green: 'border-l-green-500',
  blue: 'border-l-blue-500',
  purple: 'border-l-purple-500',
  pink: 'border-l-pink-500',
  gray: 'border-l-gray-500',
}

const COLOR_DOT_CLASSES: Record<ColorTag, string> = {
  red: 'bg-red-500',
  orange: 'bg-orange-500',
  yellow: 'bg-yellow-500',
  green: 'bg-green-500',
  blue: 'bg-blue-500',
  purple: 'bg-purple-500',
  pink: 'bg-pink-500',
  gray: 'bg-gray-500',
}

interface NotebookItemProps {
  item: CanvasItemData
  variant: 'card' | 'sticky'
  onUpdate: (id: string, updates: Partial<CanvasItemData>) => void
  onArchive: (id: string) => void
  onGraduate: (item: CanvasItemData) => void
  onOpenFiling: (itemId: string) => void
  onUnfileItem: (id: string) => void
  filingTargets: FilingTarget[]
  // Only needed for card variant (list view drag-and-drop)
  onDragStart?: (id: string) => void
  onDragOver?: (e: React.DragEvent, targetId: string) => void
  onDragEnd?: () => void
  isDragging?: boolean
}

export default function NotebookItem({
  item,
  variant,
  onUpdate,
  onArchive,
  onGraduate,
  onOpenFiling,
  onUnfileItem,
  filingTargets,
  onDragStart,
  onDragOver,
  onDragEnd,
  isDragging,
}: NotebookItemProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(item.title)
  const [editContent, setEditContent] = useState(item.content || '')
  const [showMenu, setShowMenu] = useState(false)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)
  const contentRef = useRef<HTMLTextAreaElement>(null)

  const config = ITEM_TYPE_CONFIG[item.item_type]
  const icon = ITEM_TYPE_ICONS[item.item_type]
  const canGraduate = item.item_type === 'character' || item.item_type === 'world'

  // Focus title on edit start
  useEffect(() => {
    if (isEditing && titleRef.current) {
      titleRef.current.focus()
      titleRef.current.select()
    }
  }, [isEditing])

  // Auto-resize textarea
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.style.height = 'auto'
      contentRef.current.style.height = contentRef.current.scrollHeight + 'px'
    }
  }, [editContent])

  const handleSave = () => {
    onUpdate(item.id, { title: editTitle, content: editContent })
    setIsEditing(false)
  }

  const handleCancel = () => {
    setEditTitle(item.title)
    setEditContent(item.content || '')
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleCancel()
    } else if (e.key === 'Enter' && e.metaKey) {
      handleSave()
    }
  }

  const handleColorChange = (color: ColorTag | null) => {
    onUpdate(item.id, { color_tag: color })
    setShowColorPicker(false)
  }

  // --- Shared menu dropdown ---
  const menuDropdown = showMenu && (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={() => setShowMenu(false)}
      />
      <div className="dropdown-panel absolute right-0 top-full mt-1 z-50 py-1 min-w-[140px]">
        <button
          onClick={() => {
            setIsEditing(true)
            setShowMenu(false)
          }}
          className="dropdown-item"
        >
          Edit
        </button>
        <button
          onClick={() => {
            setShowColorPicker(true)
            setShowMenu(false)
          }}
          className="dropdown-item"
        >
          Color
        </button>
        {item.filed_to_page_id ? (
          <button
            onClick={() => {
              onUnfileItem(item.id)
              setShowMenu(false)
            }}
            className="dropdown-item"
          >
            Unfile
          </button>
        ) : (
          <button
            onClick={() => {
              onOpenFiling(item.id)
              setShowMenu(false)
            }}
            className="dropdown-item"
          >
            File To...
          </button>
        )}
        {canGraduate && (
          <button
            onClick={() => {
              onGraduate(item)
              setShowMenu(false)
            }}
            className="dropdown-item"
          >
            Graduate
          </button>
        )}
        <div className="dropdown-separator" />
        <button
          onClick={() => {
            onArchive(item.id)
            setShowMenu(false)
          }}
          className="dropdown-item hover-fade-danger text-[var(--color-error)]"
        >
          Archive
        </button>
      </div>
    </>
  )

  // --- Shared color picker ---
  const colorPicker = showColorPicker && (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={() => setShowColorPicker(false)}
      />
      <div className="dropdown-panel absolute left-3 top-full mt-1 z-50 p-2">
        <div className="grid grid-cols-4 gap-1">
          {COLOR_OPTIONS.map(color => (
            <Tip key={color} content={color.charAt(0).toUpperCase() + color.slice(1)}>
              <button
                onClick={() => handleColorChange(color)}
                className={`w-6 h-6 rounded hover-fade ${COLOR_DOT_CLASSES[color]} hover:ring-2 ring-[var(--text-primary)]/50 transition-all ${
                  item.color_tag === color ? 'ring-2' : ''
                }`}
              />
            </Tip>
          ))}
          <Tip content="Remove color">
            <button
              onClick={() => handleColorChange(null)}
              className={`w-6 h-6 rounded bg-[var(--bg-tertiary)] hover-fade hover:ring-2 ring-[var(--text-primary)]/50 transition-all flex items-center justify-center text-xs ${
                !item.color_tag ? 'ring-2' : ''
              }`}
            >
              ✕
            </button>
          </Tip>
        </div>
      </div>
    </>
  )

  // --- Shared editing form ---
  const editingForm = (
    <div className="space-y-2" onKeyDown={handleKeyDown}>
      <input
        ref={titleRef}
        value={editTitle}
        onChange={(e) => setEditTitle(e.target.value)}
        className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text-primary)] font-medium focus:outline-none focus:border-[var(--color-primary)]"
        placeholder="Title"
      />
      <textarea
        ref={contentRef}
        value={editContent}
        onChange={(e) => setEditContent(e.target.value)}
        className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-2 py-1 text-sm text-[var(--text-secondary)] resize-none min-h-[60px] focus:outline-none focus:border-[var(--color-primary)]"
        placeholder="Notes, ideas, fragments..."
      />
      <div className="flex gap-2 justify-end">
        <button
          onClick={handleCancel}
          className="type-micro px-2 py-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          CANCEL
        </button>
        <button
          onClick={handleSave}
          className="type-micro px-2 py-1 border border-[var(--text-primary)] text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]"
        >
          SAVE
        </button>
      </div>
    </div>
  )

  // --- Menu button ---
  const menuButton = (
    <div className="relative">
      <Tip content="Options">
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="p-1 rounded hover-fade hover:bg-[var(--bg-tertiary)] opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <svg className="w-4 h-4 text-[var(--text-muted)]" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
          </svg>
        </button>
      </Tip>
      {menuDropdown}
    </div>
  )

  // ============================================================
  // CARD VARIANT (list view -- same as original CanvasItem)
  // ============================================================
  if (variant === 'card') {
    return (
      <div
        draggable
        onDragStart={() => onDragStart?.(item.id)}
        onDragOver={(e) => onDragOver?.(e, item.id)}
        onDragEnd={onDragEnd}
        className={`
          relative group rounded-lg border-l-4 transition-all cursor-grab active:cursor-grabbing hover-glow
          ${item.color_tag ? COLOR_CLASSES[item.color_tag] : ''}
          ${isDragging ? 'opacity-50 scale-95' : 'opacity-100'}
          bg-[var(--bg-secondary)]
          border border-[var(--border)] hover:border-[var(--border-strong)] hover:shadow-[0_2px_8px_color-mix(in_srgb,var(--text-primary)_8%,transparent)]
        `}
        style={!item.color_tag ? { borderLeftColor: config.borderColor } : undefined}
      >
        {/* Header with type icon and menu */}
        <div className="flex items-center justify-between px-3 pt-3 pb-2">
          <div className="flex items-center gap-2">
            <span className="text-[var(--text-muted)]">{icon}</span>
            <span className="type-micro" style={{ color: config.borderColor }}>
              {config.label}
            </span>
          </div>
          {menuButton}
        </div>

        {/* Content */}
        <div className="px-3 pb-3">
          {isEditing ? editingForm : (
            <div onClick={() => setIsEditing(true)} className="cursor-text">
              <h3 className="font-medium text-[var(--text-primary)] mb-1">{item.title}</h3>
              {item.content && (
                <p className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap line-clamp-4">
                  {item.content}
                </p>
              )}
              {!item.content && (
                <p className="text-sm text-[var(--text-muted)] italic">Click to add notes...</p>
              )}
            </div>
          )}
        </div>

        {/* Inspiration source */}
        {item.inspiration_source && (
          <div className="px-3 pb-2">
            <span className="text-xs text-[var(--text-muted)]">
              Inspired by: {item.inspiration_source}
            </span>
          </div>
        )}

        {/* Filed badge */}
        {item.filed_to_page_id && (
          <div className="px-3 pb-2">
            <span className="type-micro px-2 py-0.5 border border-[var(--color-primary)]/30 text-[var(--color-primary)]">
              FILED TO PG {filingTargets.find(t => t.pageId === item.filed_to_page_id)?.pageNumber || '?'}
            </span>
          </div>
        )}

        {/* Source badge for AI-generated items */}
        {item.source === 'ai' && (
          <div className="px-3 pb-2">
            <span className="type-micro px-2 py-0.5 border border-[var(--accent-hover)]/30 text-[var(--accent-hover)]">AI GENERATED</span>
          </div>
        )}

        {/* Graduate badge for character/world items */}
        {canGraduate && (
          <Tip content="Promote to character or location">
            <button
              onClick={() => onGraduate(item)}
              className="absolute bottom-2 right-2 type-micro px-2 py-0.5 border border-[var(--color-primary)]/50 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 hover-lift opacity-0 group-hover:opacity-100 transition-all duration-150"
            >
              GRADUATE
            </button>
          </Tip>
        )}

        {/* Color picker modal */}
        {colorPicker}
      </div>
    )
  }

  // ============================================================
  // STICKY VARIANT (cork board -- compact note appearance)
  // ============================================================
  return (
    <div
      className={`
        relative group w-[220px] transition-all hover-glow
        bg-[var(--bg-primary)]
        border border-[var(--border)] border-l-4
        shadow-[0_2px_8px_color-mix(in_srgb,var(--text-primary)_8%,transparent)]
        ${item.color_tag ? COLOR_CLASSES[item.color_tag] : ''}
      `}
      style={!item.color_tag ? { borderLeftColor: config.borderColor } : undefined}
    >
      {/* Header with type icon and menu */}
      <div className="flex items-center justify-between px-2 pt-2 pb-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[var(--text-muted)]">{icon}</span>
          <span className="type-micro" style={{ color: config.borderColor }}>
            {config.label}
          </span>
        </div>
        {menuButton}
      </div>

      {/* Content */}
      <div className="px-2 pb-2">
        {isEditing ? editingForm : (
          <div onClick={() => setIsEditing(true)} className="cursor-text">
            <h3 className="font-medium text-sm text-[var(--text-primary)] mb-0.5 truncate">{item.title}</h3>
            {item.content && (
              <p className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap line-clamp-2">
                {item.content}
              </p>
            )}
            {!item.content && (
              <p className="text-xs text-[var(--text-muted)] italic">Click to add notes...</p>
            )}
          </div>
        )}
      </div>

      {/* Filed badge */}
      {item.filed_to_page_id && (
        <div className="px-2 pb-1.5">
          <span className="type-micro px-1.5 py-0.5 border border-[var(--color-primary)]/30 text-[var(--color-primary)] text-[10px]">
            PG {filingTargets.find(t => t.pageId === item.filed_to_page_id)?.pageNumber || '?'}
          </span>
        </div>
      )}

      {/* Source badge for AI-generated items */}
      {item.source === 'ai' && !item.filed_to_page_id && (
        <div className="px-2 pb-1.5">
          <span className="type-micro px-1.5 py-0.5 border border-[var(--accent-hover)]/30 text-[var(--accent-hover)] text-[10px]">AI</span>
        </div>
      )}

      {/* Color picker modal */}
      {colorPicker}
    </div>
  )
}
