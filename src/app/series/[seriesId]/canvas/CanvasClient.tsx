'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import CanvasItem from './CanvasItem'
import GraduationModal from './GraduationModal'
import EmptyState from '@/components/ui/EmptyState'

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
  filed_to_scene_id: string | null
  filed_to_page_id: string | null
  filed_at: string | null
  source: 'manual' | 'ai' | 'guided' | null
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

export interface FilingTarget {
  issueId: string
  issueNumber: number
  issueTitle: string | null
  sceneId: string
  sceneName: string | null
  pageId: string
  pageNumber: number
}

type FilingFilter = 'all' | 'unfiled' | 'filed'

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
  const [filingFilter, setFilingFilter] = useState<FilingFilter>('all')
  const [graduatingItem, setGraduatingItem] = useState<CanvasItemData | null>(null)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [filingTargets, setFilingTargets] = useState<FilingTarget[]>([])
  const [filingTargetsLoaded, setFilingTargetsLoaded] = useState(false)

  const supabase = createClient()

  // Load filing targets (issues -> scenes -> pages)
  const loadFilingTargets = useCallback(async () => {
    if (filingTargetsLoaded) return
    const { data: issues } = await supabase
      .from('issues')
      .select('id, number, title')
      .eq('series_id', seriesId)
      .order('number')

    if (!issues) return

    const targets: FilingTarget[] = []
    for (const issue of issues) {
      const { data: acts } = await supabase
        .from('acts')
        .select('id, sort_order')
        .eq('issue_id', issue.id)
        .order('sort_order')

      if (!acts) continue
      for (const act of acts) {
        const { data: scenes } = await supabase
          .from('scenes')
          .select('id, name, title, sort_order')
          .eq('act_id', act.id)
          .order('sort_order')

        if (!scenes) continue
        for (const scene of scenes) {
          const { data: pages } = await supabase
            .from('pages')
            .select('id, page_number')
            .eq('scene_id', scene.id)
            .order('page_number')

          if (!pages) continue
          for (const page of pages) {
            targets.push({
              issueId: issue.id,
              issueNumber: issue.number,
              issueTitle: issue.title,
              sceneId: scene.id,
              sceneName: scene.name || scene.title,
              pageId: page.id,
              pageNumber: page.page_number,
            })
          }
        }
      }
    }
    setFilingTargets(targets)
    setFilingTargetsLoaded(true)
  }, [supabase, seriesId, filingTargetsLoaded])

  // Filter items by type and filing status
  const filteredItems = items.filter(item => {
    if (filter !== 'all' && item.item_type !== filter) return false
    if (filingFilter === 'filed' && !item.filed_to_page_id) return false
    if (filingFilter === 'unfiled' && item.filed_to_page_id) return false
    return true
  })

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

  // File item to a page
  const handleFileItem = useCallback(async (id: string, target: FilingTarget) => {
    const updates = {
      filed_to_scene_id: target.sceneId,
      filed_to_page_id: target.pageId,
      filed_at: new Date().toISOString(),
    }

    setItems(prev => prev.map(item =>
      item.id === id ? { ...item, ...updates, updated_at: new Date().toISOString() } : item
    ))

    const { error } = await supabase
      .from('canvas_items')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) {
      console.error('Error filing canvas item:', error)
      setItems(initialItems)
    }
  }, [supabase, initialItems])

  // Unfile item
  const handleUnfileItem = useCallback(async (id: string) => {
    const updates = {
      filed_to_scene_id: null,
      filed_to_page_id: null,
      filed_at: null,
    }

    setItems(prev => prev.map(item =>
      item.id === id ? { ...item, ...updates, updated_at: new Date().toISOString() } : item
    ))

    const { error } = await supabase
      .from('canvas_items')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) {
      console.error('Error unfiling canvas item:', error)
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
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      {/* Header */}
      <header className="border-b border-[var(--border)] bg-[var(--bg-secondary)]/50">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href={`/series/${seriesId}`}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
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
                className="px-4 py-2 bg-[var(--color-primary)] hover:opacity-90 rounded-lg font-medium active:scale-[0.97] transition-all duration-150 ease-out"
              >
                + Add Idea
              </button>

              {/* Type selector dropdown */}
              {isCreating && (
                <div className="absolute right-0 top-full mt-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg shadow-xl z-50 py-2 min-w-[180px]">
                  {Object.entries(ITEM_TYPE_CONFIG).map(([type, config]) => (
                    <button
                      key={type}
                      onClick={() => handleCreateItem(type as ItemType)}
                      className="w-full px-4 py-2 text-left hover:bg-[var(--bg-tertiary)] flex items-center gap-2 active:scale-[0.97] transition-all duration-150 ease-out"
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
          <div className="flex items-center gap-4 mt-4 overflow-x-auto pb-2">
            <div className="flex gap-2">
              <button
                onClick={() => setFilter('all')}
                className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap active:scale-[0.97] transition-all duration-150 ease-out ${
                  filter === 'all'
                    ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
                    : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'
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
                    className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap flex items-center gap-1 active:scale-[0.97] transition-all duration-150 ease-out ${
                      filter === type
                        ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
                        : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'
                    }`}
                  >
                    <span>{config.icon}</span>
                    <span>{config.label}</span>
                    <span className="ml-1 opacity-60">({count})</span>
                  </button>
                )
              })}
            </div>

            {/* Filing filter */}
            <div className="flex gap-1 border-l border-[var(--border)] pl-4">
              {(['all', 'unfiled', 'filed'] as FilingFilter[]).map(f => (
                <button
                  key={f}
                  onClick={() => setFilingFilter(f)}
                  className={`px-2 py-1 rounded text-xs font-medium capitalize active:scale-[0.97] transition-all duration-150 ease-out ${
                    filingFilter === f
                      ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* Canvas grid */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {filteredItems.length === 0 ? (
          <EmptyState
            icon="💭"
            title="Your canvas is empty"
            description="Start dumping ideas here -- characters, themes, visuals, what-ifs. They can graduate to structured entities when ready."
            actionLabel="+ Add Your First Idea"
            onAction={() => setIsCreating(true)}
          />
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
                onFileItem={handleFileItem}
                onUnfileItem={handleUnfileItem}
                filingTargets={filingTargets}
                onLoadFilingTargets={loadFilingTargets}
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
