'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import NotebookItem from './NotebookItem'
import NotebookListView from './NotebookListView'
import NotebookCorkBoard from './NotebookCorkBoard'
import FiledNotesTab from './FiledNotesTab'
import GraduationModal from './GraduationModal'
import SendToPageModal from './SendToPageModal'
import EmptyState from '@/components/ui/EmptyState'
import Header from '@/components/ui/Header'
import {
  Users, Lightbulb, Palette, HelpCircle, MessageSquare, Swords, Globe, MessageSquarePlus,
  LayoutGrid, List, Archive,
} from 'lucide-react'
import { type ReactNode } from 'react'

// --- Types (exported for child components) ---
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
  cork_board_x: number | null
  cork_board_y: number | null
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
type ViewMode = 'corkboard' | 'list' | 'filed'

// --- Constants (exported for child components) ---
export const ITEM_TYPE_CONFIG: Record<ItemType, { label: string; borderColor: string }> = {
  character: { label: 'CHARACTER', borderColor: 'var(--color-primary)' },
  theme: { label: 'THEME', borderColor: 'var(--color-warning)' },
  visual: { label: 'VISUAL', borderColor: 'var(--accent-hover)' },
  scenario: { label: 'WHAT IF', borderColor: 'var(--color-error)' },
  dialogue: { label: 'DIALOGUE', borderColor: '#0891b2' },
  conflict: { label: 'CONFLICT', borderColor: 'var(--color-error)' },
  world: { label: 'WORLD', borderColor: 'var(--color-info)' },
}

export const ITEM_TYPE_ICONS: Record<ItemType, ReactNode> = {
  character: <Users size={16} />,
  theme: <Lightbulb size={16} />,
  visual: <Palette size={16} />,
  scenario: <HelpCircle size={16} />,
  dialogue: <MessageSquare size={16} />,
  conflict: <Swords size={16} />,
  world: <Globe size={16} />,
}

export const COLOR_OPTIONS: ColorTag[] = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'gray']

// --- Props ---
interface NotebookClientProps {
  seriesId: string
  seriesTitle: string
  initialItems: CanvasItemData[]
  characters: Character[]
  locations: Location[]
}

export default function NotebookClient({
  seriesId,
  seriesTitle,
  initialItems,
  characters,
  locations,
}: NotebookClientProps) {
  const [items, setItems] = useState<CanvasItemData[]>(initialItems)
  const [view, setView] = useState<ViewMode>('corkboard')
  const [isCreating, setIsCreating] = useState(false)
  const [filter, setFilter] = useState<ItemType | 'all'>('all')
  const [filingFilter, setFilingFilter] = useState<FilingFilter>('all')
  const [graduatingItem, setGraduatingItem] = useState<CanvasItemData | null>(null)
  const [filingTargets, setFilingTargets] = useState<FilingTarget[]>([])
  const [filingTargetsLoaded, setFilingTargetsLoaded] = useState(false)
  const [filingItemId, setFilingItemId] = useState<string | null>(null)
  const [draggedId, setDraggedId] = useState<string | null>(null)

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
          .select('id, title, sort_order')
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
              sceneName: scene.title,
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

  // Compute next available cork board position
  const getNextCorkBoardPosition = useCallback((): { x: number; y: number } => {
    const COLUMNS = 5
    const SPACING_X = 260
    const SPACING_Y = 200
    const START_X = 50
    const START_Y = 50

    const count = items.length
    const col = count % COLUMNS
    const row = Math.floor(count / COLUMNS)
    return {
      x: START_X + col * SPACING_X + (Math.random() * 20 - 10),
      y: START_Y + row * SPACING_Y + (Math.random() * 20 - 10),
    }
  }, [items.length])

  // Create new item (optionally at a cork board position)
  const handleCreateItem = useCallback(async (type: ItemType, x?: number, y?: number) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // If no position provided and we're in cork board view, compute one
    const pos = (x !== undefined && y !== undefined)
      ? { x, y }
      : getNextCorkBoardPosition()

    const newItem: Record<string, unknown> = {
      series_id: seriesId,
      user_id: user.id,
      item_type: type,
      title: 'New Idea',
      content: '',
      sort_order: items.length,
      cork_board_x: pos.x,
      cork_board_y: pos.y,
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
  }, [supabase, seriesId, items.length, getNextCorkBoardPosition])

  // Create item at a specific cork board position
  const handleCreateAtPosition = useCallback(async (type: ItemType, x: number, y: number) => {
    await handleCreateItem(type, x, y)
  }, [handleCreateItem])

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

  // Update cork board position (fire-and-forget)
  const handlePositionUpdate = useCallback(async (id: string, x: number, y: number) => {
    // Optimistic update
    setItems(prev => prev.map(item =>
      item.id === id ? { ...item, cork_board_x: x, cork_board_y: y, updated_at: new Date().toISOString() } : item
    ))

    // Fire-and-forget DB update
    supabase
      .from('canvas_items')
      .update({ cork_board_x: x, cork_board_y: y, updated_at: new Date().toISOString() })
      .eq('id', id)
      .then(({ error }) => {
        if (error) {
          console.error('Error updating cork board position:', error)
        }
      })
  }, [supabase])

  // Open filing modal
  const handleOpenFilingModal = useCallback((itemId: string) => {
    loadFilingTargets()
    setFilingItemId(itemId)
  }, [loadFilingTargets])

  // Drag and drop handlers (for list view)
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
      <Header
        variant="subpage"
        backHref={`/series/${seriesId}`}
        backLabel={seriesTitle}
        title="Notebook"
        maxWidth="max-w-7xl"
        secondaryRow={
          view !== 'filed' ? (
            <div className="flex items-center gap-4 overflow-x-auto pb-2">
              <div className="flex gap-2">
                <button
                  onClick={() => setFilter('all')}
                  className={`type-micro px-3 py-1.5 whitespace-nowrap active:scale-[0.97] transition-all duration-150 ease-out ${
                    filter === 'all'
                      ? 'border border-[var(--text-primary)] text-[var(--text-primary)]'
                      : 'border border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text-secondary)]'
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
                      className={`type-micro px-3 py-1.5 whitespace-nowrap flex items-center gap-1 active:scale-[0.97] transition-all duration-150 ease-out ${
                        filter === type
                          ? 'border border-[var(--text-primary)] text-[var(--text-primary)]'
                          : 'border border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text-secondary)]'
                      }`}
                    >
                      <span className="text-[var(--text-muted)]">{ITEM_TYPE_ICONS[type as ItemType]}</span>
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
                    className={`type-micro px-3 py-1.5 capitalize active:scale-[0.97] transition-all duration-150 ease-out ${
                      filingFilter === f
                        ? 'border border-[var(--text-primary)] text-[var(--text-primary)]'
                        : 'border border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text-secondary)]'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
          ) : undefined
        }
      >
        {/* View toggle buttons */}
        <div className="flex items-center gap-1 mr-2">
          {([
            { mode: 'corkboard' as ViewMode, icon: <LayoutGrid size={14} />, label: 'BOARD' },
            { mode: 'list' as ViewMode, icon: <List size={14} />, label: 'LIST' },
            { mode: 'filed' as ViewMode, icon: <Archive size={14} />, label: 'FILED' },
          ]).map(({ mode, icon, label }) => (
            <button
              key={mode}
              onClick={() => setView(mode)}
              className={`type-micro px-3 py-1.5 flex items-center gap-1 whitespace-nowrap active:scale-[0.97] transition-all duration-150 ease-out ${
                view === mode
                  ? 'border border-[var(--text-primary)] text-[var(--text-primary)]'
                  : 'border border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text-secondary)]'
              }`}
            >
              {icon} {label}
            </button>
          ))}
        </div>

        {/* + Add Idea button + dropdown */}
        <div className="relative">
          <button
            onClick={() => setIsCreating(!isCreating)}
            className="type-label px-4 py-2 border border-[var(--text-primary)] text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] active:scale-[0.97] transition-all duration-150 ease-out"
          >
            + Add Idea
          </button>

          {/* Type selector dropdown */}
          {isCreating && (
            <div className="dropdown-panel absolute right-0 top-full mt-2 z-50 min-w-[180px]">
              {Object.entries(ITEM_TYPE_CONFIG).map(([type, config]) => (
                <button
                  key={type}
                  onClick={() => handleCreateItem(type as ItemType)}
                  className="dropdown-item w-full text-left flex items-center gap-2 active:scale-[0.97] transition-all duration-150 ease-out"
                >
                  <span className="text-[var(--text-muted)]">{ITEM_TYPE_ICONS[type as ItemType]}</span>
                  <span>{config.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </Header>

      <main className={view === 'corkboard' ? '' : 'max-w-7xl mx-auto px-4 py-6'}>
        {view === 'corkboard' && (
          <NotebookCorkBoard
            items={filteredItems}
            allItems={items}
            onUpdate={handleUpdateItem}
            onArchive={handleArchiveItem}
            onGraduate={handleGraduate}
            onOpenFiling={handleOpenFilingModal}
            onUnfileItem={handleUnfileItem}
            onPositionUpdate={handlePositionUpdate}
            onCreateAtPosition={handleCreateAtPosition}
            filingTargets={filingTargets}
          />
        )}
        {view === 'list' && (
          filteredItems.length === 0 ? (
            <EmptyState
              lucideIcon={<MessageSquarePlus size={32} />}
              title="Your notebook is empty"
              description="Start dumping ideas here -- characters, themes, visuals, what-ifs. They can graduate to structured entities when ready."
              actionLabel="+ Add Your First Idea"
              onAction={() => setIsCreating(true)}
            />
          ) : (
            <NotebookListView
              items={filteredItems}
              onUpdate={handleUpdateItem}
              onArchive={handleArchiveItem}
              onGraduate={handleGraduate}
              onOpenFiling={handleOpenFilingModal}
              onUnfileItem={handleUnfileItem}
              filingTargets={filingTargets}
              onLoadFilingTargets={loadFilingTargets}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
              draggedId={draggedId}
            />
          )
        )}
        {view === 'filed' && (
          <FiledNotesTab
            items={items.filter(i => !!i.filed_to_page_id)}
            filingTargets={filingTargets}
            onUnfileItem={handleUnfileItem}
            onLoadFilingTargets={loadFilingTargets}
          />
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

      {/* Send to Page modal */}
      {filingItemId && (
        <SendToPageModal
          seriesId={seriesId}
          filingTargets={filingTargets}
          onLoadTargets={loadFilingTargets}
          onFile={(target) => {
            handleFileItem(filingItemId, target)
            setFilingItemId(null)
          }}
          onClose={() => setFilingItemId(null)}
        />
      )}

      {/* Click-outside for dropdown */}
      {isCreating && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsCreating(false)}
        />
      )}
    </div>
  )
}
