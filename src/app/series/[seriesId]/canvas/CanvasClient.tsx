'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import CanvasItem from './CanvasItem'
import GraduationModal from './GraduationModal'

// Types
export type ItemType = 'character' | 'theme' | 'visual' | 'scenario' | 'dialogue' | 'conflict' | 'world'
export type ColorTag = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'pink' | 'gray'

export interface CanvasItemData {
  id: string
  series_id: string
  user_id: string
  item_type: ItemType
  title: string
  content: string | null
  color_tag: ColorTag | null
  inspiration_source: string | null
  sort_order: number
  promoted_to_character_id: string | null
  promoted_to_location_id: string | null
  archived: boolean
  created_at: string
  updated_at: string
}

export interface Character {
  id: string
  name: string
  role: string | null
}

export interface Location {
  id: string
  name: string
}

interface CanvasClientProps {
  seriesId: string
  seriesTitle: string
  initialItems: CanvasItemData[]
  characters: Character[]
  locations: Location[]
}

const ITEM_TYPE_CONFIG: Record<ItemType, { icon: string; label: string; color: string }> = {
  character: { icon: '🎭', label: 'Character', color: 'from-purple-900/50 to-purple-800/30' },
  theme: { icon: '💡', label: 'Theme', color: 'from-amber-900/50 to-amber-800/30' },
  visual: { icon: '🎨', label: 'Visual', color: 'from-cyan-900/50 to-cyan-800/30' },
  scenario: { icon: '❓', label: 'What If', color: 'from-rose-900/50 to-rose-800/30' },
  dialogue: { icon: '🗣️', label: 'Dialogue', color: 'from-green-900/50 to-green-800/30' },
  conflict: { icon: '⚔️', label: 'Conflict', color: 'from-red-900/50 to-red-800/30' },
  world: { icon: '🌍', label: 'World', color: 'from-blue-900/50 to-blue-800/30' },
}

const COLOR_OPTIONS: ColorTag[] = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'gray']

export default function CanvasClient({
  seriesId,
  seriesTitle,
  initialItems,
  characters,
  locations,
}: CanvasClientProps) {
  const [items, setItems] = useState<CanvasItemData[]>(initialItems)
  const [isCreating, setIsCreating] = useState(false)
  const [filter, setFilter] = useState<ItemType | 'all'>('all')
  const [graduatingItem, setGraduatingItem] = useState<CanvasItemData | null>(null)
  const [draggedId, setDraggedId] = useState<string | null>(null)

  const supabase = createClient()

  // Filter items
  const filteredItems = filter === 'all'
    ? items
    : items.filter(item => item.item_type === filter)

  // Create new item
  const handleCreateItem = useCallback(async (type: ItemType) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const newItem = {
      series_id: seriesId,
      user_id: user.id,
      item_type: type,
      title: 'New Idea',
      content: '',
      sort_order: items.length,
    }

    const { data, error } = await supabase
      .from('canvas_items')
      .insert(newItem)
      .select()
      .single()

    if (error) {
      console.error('Error creating canvas item:', error)
      return
    }

    setItems(prev => [...prev, data])
    setIsCreating(false)
  }, [supabase, seriesId, items.length])

  // Update item
  const handleUpdateItem = useCallback(async (id: string, updates: Partial<CanvasItemData>) => {
    // Optimistic update
    setItems(prev => prev.map(item =>
      item.id === id ? { ...item, ...updates, updated_at: new Date().toISOString() } : item
    ))

    const { error } = await supabase
      .from('canvas_items')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) {
      console.error('Error updating canvas item:', error)
      // Revert on error
      setItems(initialItems)
    }
  }, [supabase, initialItems])

  // Archive item
  const handleArchiveItem = useCallback(async (id: string) => {
    setItems(prev => prev.filter(item => item.id !== id))

    const { error } = await supabase
      .from('canvas_items')
      .update({ archived: true })
      .eq('id', id)

    if (error) {
      console.error('Error archiving canvas item:', error)
      setItems(initialItems)
    }
  }, [supabase, initialItems])

  // Handle graduation (promote to character/location)
  const handleGraduate = useCallback((item: CanvasItemData) => {
    setGraduatingItem(item)
  }, [])

  // Complete graduation
  const handleGraduationComplete = useCallback(async (
    item: CanvasItemData,
    targetType: 'character' | 'location',
    targetId: string
  ) => {
    const updates = targetType === 'character'
      ? { promoted_to_character_id: targetId, archived: true }
      : { promoted_to_location_id: targetId, archived: true }

    setItems(prev => prev.filter(i => i.id !== item.id))

    const { error } = await supabase
      .from('canvas_items')
      .update(updates)
      .eq('id', item.id)

    if (error) {
      console.error('Error graduating canvas item:', error)
      setItems(initialItems)
    }

    setGraduatingItem(null)
  }, [supabase, initialItems])

  // Drag and drop handlers
  const handleDragStart = (id: string) => {
    setDraggedId(id)
  }

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    if (!draggedId || draggedId === targetId) return

    setItems(prev => {
      const draggedIndex = prev.findIndex(i => i.id === draggedId)
      const targetIndex = prev.findIndex(i => i.id === targetId)
      if (draggedIndex === -1 || targetIndex === -1) return prev

      const newItems = [...prev]
      const [draggedItem] = newItems.splice(draggedIndex, 1)
      newItems.splice(targetIndex, 0, draggedItem)

      // Update sort orders
      return newItems.map((item, index) => ({ ...item, sort_order: index }))
    })
  }

  const handleDragEnd = async () => {
    if (!draggedId) return

    // Persist new order
    const updates = items.map((item, index) => ({
      id: item.id,
      sort_order: index,
    }))

    for (const update of updates) {
      await supabase
        .from('canvas_items')
        .update({ sort_order: update.sort_order })
        .eq('id', update.id)
    }

    setDraggedId(null)
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/50">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href={`/series/${seriesId}`}
                className="text-gray-400 hover:text-white transition-colors"
              >
                ← {seriesTitle}
              </Link>
              <h1 className="text-xl font-semibold flex items-center gap-2">
                <span className="text-2xl">💭</span>
                Canvas
              </h1>
            </div>

            {/* Add idea button */}
            <div className="relative">
              <button
                onClick={() => setIsCreating(!isCreating)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg font-medium transition-colors"
              >
                + Add Idea
              </button>

              {/* Type selector dropdown */}
              {isCreating && (
                <div className="absolute right-0 top-full mt-2 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 py-2 min-w-[180px]">
                  {Object.entries(ITEM_TYPE_CONFIG).map(([type, config]) => (
                    <button
                      key={type}
                      onClick={() => handleCreateItem(type as ItemType)}
                      className="w-full px-4 py-2 text-left hover:bg-gray-700 flex items-center gap-2"
                    >
                      <span>{config.icon}</span>
                      <span>{config.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Filter tabs */}
          <div className="flex gap-2 mt-4 overflow-x-auto pb-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
                filter === 'all'
                  ? 'bg-white text-gray-900'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              All ({items.length})
            </button>
            {Object.entries(ITEM_TYPE_CONFIG).map(([type, config]) => {
              const count = items.filter(i => i.item_type === type).length
              if (count === 0) return null
              return (
                <button
                  key={type}
                  onClick={() => setFilter(type as ItemType)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-1 ${
                    filter === type
                      ? 'bg-white text-gray-900'
                      : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  <span>{config.icon}</span>
                  <span>{config.label}</span>
                  <span className="ml-1 opacity-60">({count})</span>
                </button>
              )
            })}
          </div>
        </div>
      </header>

      {/* Canvas grid */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {filteredItems.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">💭</div>
            <h2 className="text-xl font-medium text-gray-300 mb-2">Your canvas is empty</h2>
            <p className="text-gray-500 mb-6">
              Start dumping ideas here—characters, themes, visuals, what-ifs. <br />
              They can graduate to structured entities when ready.
            </p>
            <button
              onClick={() => setIsCreating(true)}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-lg font-medium transition-colors"
            >
              + Add Your First Idea
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredItems.map(item => (
              <CanvasItem
                key={item.id}
                item={item}
                config={ITEM_TYPE_CONFIG[item.item_type]}
                onUpdate={handleUpdateItem}
                onArchive={handleArchiveItem}
                onGraduate={handleGraduate}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
                isDragging={draggedId === item.id}
              />
            ))}
          </div>
        )}
      </main>

      {/* Graduation modal */}
      {graduatingItem && (
        <GraduationModal
          item={graduatingItem}
          characters={characters}
          locations={locations}
          seriesId={seriesId}
          onComplete={handleGraduationComplete}
          onClose={() => setGraduatingItem(null)}
        />
      )}

      {/* Click outside to close dropdown */}
      {isCreating && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsCreating(false)}
        />
      )}
    </div>
  )
}

export { ITEM_TYPE_CONFIG, COLOR_OPTIONS }
