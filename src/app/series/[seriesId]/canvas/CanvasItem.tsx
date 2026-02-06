'use client'

import { useState, useRef, useEffect } from 'react'
import { CanvasItemData, ColorTag, COLOR_OPTIONS } from './CanvasClient'

interface CanvasItemProps {
  item: CanvasItemData
  config: { icon: string; label: string; color: string }
  onUpdate: (id: string, updates: Partial<CanvasItemData>) => void
  onArchive: (id: string) => void
  onGraduate: (item: CanvasItemData) => void
  onDragStart: (id: string) => void
  onDragOver: (e: React.DragEvent, targetId: string) => void
  onDragEnd: () => void
  isDragging: boolean
}

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

export default function CanvasItem({
  item,
  config,
  onUpdate,
  onArchive,
  onGraduate,
  onDragStart,
  onDragOver,
  onDragEnd,
  isDragging,
}: CanvasItemProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(item.title)
  const [editContent, setEditContent] = useState(item.content || '')
  const [showMenu, setShowMenu] = useState(false)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)
  const contentRef = useRef<HTMLTextAreaElement>(null)

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

  const canGraduate = item.item_type === 'character' || item.item_type === 'world'

  return (
    <div
      draggable
      onDragStart={() => onDragStart(item.id)}
      onDragOver={(e) => onDragOver(e, item.id)}
      onDragEnd={onDragEnd}
      className={`
        relative group rounded-lg border-l-4 transition-all cursor-grab active:cursor-grabbing
        ${item.color_tag ? COLOR_CLASSES[item.color_tag] : 'border-l-gray-600'}
        ${isDragging ? 'opacity-50 scale-95' : 'opacity-100'}
        bg-gradient-to-br ${config.color}
        border border-gray-700/50 hover:border-gray-600
      `}
    >
      {/* Header with type icon and menu */}
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{config.icon}</span>
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
            {config.label}
          </span>
        </div>

        {/* Menu button */}
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-1 rounded hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
            </svg>
          </button>

          {showMenu && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowMenu(false)}
              />
              <div className="absolute right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 py-1 min-w-[140px]">
                <button
                  onClick={() => {
                    setIsEditing(true)
                    setShowMenu(false)
                  }}
                  className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-700 flex items-center gap-2"
                >
                  ✏️ Edit
                </button>
                <button
                  onClick={() => {
                    setShowColorPicker(true)
                    setShowMenu(false)
                  }}
                  className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-700 flex items-center gap-2"
                >
                  🎨 Color
                </button>
                {canGraduate && (
                  <button
                    onClick={() => {
                      onGraduate(item)
                      setShowMenu(false)
                    }}
                    className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-700 flex items-center gap-2"
                  >
                    🎓 Graduate
                  </button>
                )}
                <hr className="border-gray-700 my-1" />
                <button
                  onClick={() => {
                    onArchive(item.id)
                    setShowMenu(false)
                  }}
                  className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-700 flex items-center gap-2 text-red-400"
                >
                  🗑️ Archive
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="px-3 pb-3">
        {isEditing ? (
          <div className="space-y-2" onKeyDown={handleKeyDown}>
            <input
              ref={titleRef}
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full bg-black/30 border border-gray-600 rounded px-2 py-1 text-white font-medium"
              placeholder="Title"
            />
            <textarea
              ref={contentRef}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="w-full bg-black/30 border border-gray-600 rounded px-2 py-1 text-sm text-gray-300 resize-none min-h-[60px]"
              placeholder="Notes, ideas, fragments..."
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={handleCancel}
                className="px-2 py-1 text-xs text-gray-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-500 rounded"
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          <div onClick={() => setIsEditing(true)} className="cursor-text">
            <h3 className="font-medium text-white mb-1">{item.title}</h3>
            {item.content && (
              <p className="text-sm text-gray-300 whitespace-pre-wrap line-clamp-4">
                {item.content}
              </p>
            )}
            {!item.content && (
              <p className="text-sm text-gray-500 italic">Click to add notes...</p>
            )}
          </div>
        )}
      </div>

      {/* Inspiration source */}
      {item.inspiration_source && (
        <div className="px-3 pb-2">
          <span className="text-xs text-gray-500">
            Inspired by: {item.inspiration_source}
          </span>
        </div>
      )}

      {/* Graduate badge for character/world items */}
      {canGraduate && (
        <button
          onClick={() => onGraduate(item)}
          className="absolute bottom-2 right-2 px-2 py-0.5 text-xs bg-green-600/50 hover:bg-green-600 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
        >
          Graduate →
        </button>
      )}

      {/* Color picker modal */}
      {showColorPicker && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowColorPicker(false)}
          />
          <div className="absolute left-3 top-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 p-2">
            <div className="grid grid-cols-4 gap-1">
              {COLOR_OPTIONS.map(color => (
                <button
                  key={color}
                  onClick={() => handleColorChange(color)}
                  className={`w-6 h-6 rounded ${COLOR_DOT_CLASSES[color]} hover:ring-2 ring-white/50 transition-all ${
                    item.color_tag === color ? 'ring-2' : ''
                  }`}
                />
              ))}
              <button
                onClick={() => handleColorChange(null)}
                className={`w-6 h-6 rounded bg-gray-600 hover:ring-2 ring-white/50 transition-all flex items-center justify-center text-xs ${
                  !item.color_tag ? 'ring-2' : ''
                }`}
              >
                ✕
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
