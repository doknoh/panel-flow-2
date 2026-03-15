'use client'

import { useState, useMemo, useCallback } from 'react'
import { computeSpreads, SpreadGroup } from '@/lib/weave-spreads'
import { createClient } from '@/lib/supabase/client'
import { WeavePlotlineManager, PLOTLINE_COLORS } from './components/WeavePlotlineManager'
import { WeaveHeader } from './components/WeaveHeader'
import { WeaveSelectionToolbar } from './components/WeaveSelectionToolbar'
import { WeaveSceneRegion } from './components/WeaveSceneRegion'
import { WeaveSpread } from './components/WeaveSpread'
import { WeavePageCard } from './components/WeavePageCard'
import { WeaveDrawer } from './components/WeaveDrawer'
import { useToast } from '@/contexts/ToastContext'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable'

interface Plotline {
  id: string
  name: string
  color: string
  description: string | null
  sort_order: number
}

interface DialogueBlock {
  id: string
  speaker_name: string | null
  text: string | null
  sort_order: number
}

interface Caption {
  id: string
  caption_type: string | null
  text: string | null
  sort_order: number
}

interface Panel {
  id: string
  panel_number: number
  sort_order: number
  visual_description: string | null
  dialogue_blocks: DialogueBlock[]
  captions: Caption[]
}

type PageType = 'SINGLE' | 'SPLASH' | 'SPREAD_LEFT' | 'SPREAD_RIGHT'

interface Page {
  id: string
  page_number: number
  sort_order: number
  story_beat: string | null
  intention: string | null
  visual_motif: string | null
  time_period: string | null
  plotline_id: string | null
  plotline: Plotline | null
  page_type?: PageType
  linked_page_id?: string | null
  panels?: Panel[]
}

interface Scene {
  id: string
  title: string | null
  name: string | null
  plotline_id: string | null
  plotline: Plotline | null
  pages: Page[]
  sort_order: number
  act_id: string
  intention: string | null
}

interface Act {
  id: string
  title: string | null
  number: number
  scenes: Scene[]
  sort_order: number
}

interface Issue {
  id: string
  number: number
  title: string | null
  series: {
    id: string
    title: string
  }
  plotlines: Plotline[]
  acts: Act[]
}

interface WeaveViewProps {
  issue: Issue
  seriesId: string
}

interface FlatPage {
  page: Page
  scene: Scene
  act: Act
  globalPageNumber: number
  orientation: 'left' | 'right'
  isSpread?: boolean
  spreadPartner?: FlatPage
}

export default function WeaveView({ issue: initialIssue, seriesId }: WeaveViewProps) {
  // Local state for optimistic updates
  const [issue, setIssue] = useState<Issue>(initialIssue)
  const [showPlotlineManager, setShowPlotlineManager] = useState(false)
  const [activePageId, setActivePageId] = useState<string | null>(null)
  const [selectedPageIds, setSelectedPageIds] = useState<Set<string>>(new Set())
  const [lastSelectedPageId, setLastSelectedPageId] = useState<string | null>(null)
  const [justMovedPageIds, setJustMovedPageIds] = useState<Set<string>>(new Set())
  const [activeDrawerPageId, setActiveDrawerPageId] = useState<string | null>(null)
  // Local page order for instant drag-and-drop updates (array of page IDs)
  const [localPageOrder, setLocalPageOrder] = useState<string[] | null>(null)
  const { showToast } = useToast()
  const router = useRouter()

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Compute base flatPages from issue structure (used as source of truth for page data)
  const baseFlatPages = useMemo<FlatPage[]>(() => {
    const pages: FlatPage[] = []
    const sortedActs = [...(issue.acts || [])].sort((a, b) => a.sort_order - b.sort_order)

    for (const act of sortedActs) {
      const sortedScenes = [...(act.scenes || [])].sort((a, b) => a.sort_order - b.sort_order)
      for (const scene of sortedScenes) {
        const sortedPages = [...(scene.pages || [])].sort((a, b) => a.sort_order - b.sort_order)
        for (const page of sortedPages) {
          pages.push({
            page,
            scene,
            act,
            globalPageNumber: pages.length + 1,
            orientation: 'right',
          })
        }
      }
    }

    return pages
  }, [issue])

  // Create a map for quick page lookup
  const pageMap = useMemo(() => {
    const map = new Map<string, FlatPage>()
    for (const fp of baseFlatPages) {
      map.set(fp.page.id, fp)
    }
    return map
  }, [baseFlatPages])

  // Final flatPages: use localPageOrder if set, otherwise use baseFlatPages order
  const flatPages = useMemo<FlatPage[]>(() => {
    let pages: FlatPage[]

    if (localPageOrder) {
      // Use local order for instant updates
      pages = localPageOrder
        .map(id => pageMap.get(id))
        .filter((fp): fp is FlatPage => fp !== undefined)
    } else {
      pages = baseFlatPages
    }

    // Set orientations and global page numbers based on position
    return pages.map((fp, i) => ({
      ...fp,
      globalPageNumber: i + 1,
      orientation: i === 0 ? 'right' : (i % 2 === 1 ? 'left' : 'right'),
    }))
  }, [localPageOrder, baseFlatPages, pageMap])

  const pageStats = useMemo(() => {
    const stats = new Map<string, { panelCount: number; wordCount: number; dialogueRatio: number }>()
    for (const fp of baseFlatPages) {
      const panels = fp.page.panels || []
      const panelCount = panels.length
      let totalWords = 0
      let dialogueWords = 0
      for (const panel of panels) {
        // Visual description words
        const descWords = (panel.visual_description || '').trim().split(/\s+/).filter(Boolean).length
        totalWords += descWords
        // Dialogue words
        for (const db of panel.dialogue_blocks || []) {
          const dw = (db.text || '').trim().split(/\s+/).filter(Boolean).length
          totalWords += dw
          dialogueWords += dw
        }
        // Caption words
        for (const cap of panel.captions || []) {
          const cw = (cap.text || '').trim().split(/\s+/).filter(Boolean).length
          totalWords += cw
        }
      }
      stats.set(fp.page.id, {
        panelCount,
        wordCount: totalWords,
        dialogueRatio: totalWords > 0 ? Math.round((dialogueWords / totalWords) * 100) : 0,
      })
    }
    return stats
  }, [baseFlatPages])

  const allScenes = useMemo(() => {
    const scenes: Scene[] = []
    for (const act of issue.acts || []) {
      for (const scene of act.scenes || []) {
        scenes.push(scene)
      }
    }
    return scenes.sort((a, b) => a.sort_order - b.sort_order)
  }, [issue])

  const plotlines = issue.plotlines || []

  // Handle page selection
  const handleSelectPage = useCallback((pageId: string, event: React.MouseEvent) => {
    const pageIdx = flatPages.findIndex(fp => fp.page.id === pageId)
    if (pageIdx === 0) return // Can't select page 1

    if (event.shiftKey && lastSelectedPageId) {
      // Range selection
      const lastIdx = flatPages.findIndex(fp => fp.page.id === lastSelectedPageId)
      const start = Math.min(pageIdx, lastIdx)
      const end = Math.max(pageIdx, lastIdx)
      const newSelection = new Set(selectedPageIds)
      for (let i = start; i <= end; i++) {
        if (i > 0) { // Skip page 1
          newSelection.add(flatPages[i].page.id)
        }
      }
      setSelectedPageIds(newSelection)
    } else if (event.metaKey || event.ctrlKey) {
      // Toggle selection
      const newSelection = new Set(selectedPageIds)
      if (newSelection.has(pageId)) {
        newSelection.delete(pageId)
      } else {
        newSelection.add(pageId)
      }
      setSelectedPageIds(newSelection)
      setLastSelectedPageId(pageId)
    } else {
      // Single selection (toggle if already selected alone)
      if (selectedPageIds.has(pageId) && selectedPageIds.size === 1) {
        setSelectedPageIds(new Set())
      } else {
        setSelectedPageIds(new Set([pageId]))
      }
      setLastSelectedPageId(pageId)
    }
  }, [flatPages, lastSelectedPageId, selectedPageIds])

  // Select all pages in a scene
  const handleSelectScene = useCallback((sceneId: string) => {
    const scenePagesIds = flatPages
      .filter(fp => fp.scene.id === sceneId && flatPages.indexOf(fp) > 0) // Exclude page 1
      .map(fp => fp.page.id)

    if (scenePagesIds.length === 0) return

    // If all scene pages are already selected, deselect them
    const allSelected = scenePagesIds.every(id => selectedPageIds.has(id))
    if (allSelected) {
      const newSelection = new Set(selectedPageIds)
      scenePagesIds.forEach(id => newSelection.delete(id))
      setSelectedPageIds(newSelection)
    } else {
      // Select all scene pages
      const newSelection = new Set(selectedPageIds)
      scenePagesIds.forEach(id => newSelection.add(id))
      setSelectedPageIds(newSelection)
    }
    showToast(allSelected ? 'Scene deselected' : `Selected ${scenePagesIds.length} pages`, 'success')
  }, [flatPages, selectedPageIds, showToast])

  // Clear selection
  const clearSelection = useCallback(() => {
    setSelectedPageIds(new Set())
    setLastSelectedPageId(null)
  }, [])

  // Handle drag end - reorder pages (including multi-select)
  // Uses optimistic UI update + batched database writes for responsiveness
  // IMPORTANT: This is NOT async to ensure state updates happen synchronously
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    setActivePageId(null)

    if (!over || active.id === over.id) return

    const activeIdx = flatPages.findIndex(fp => fp.page.id === active.id)
    const overIdx = flatPages.findIndex(fp => fp.page.id === over.id)

    if (activeIdx === -1 || overIdx === -1) return

    // Don't allow moving page 1
    if (activeIdx === 0) {
      showToast('Cannot move the first page', 'error')
      return
    }

    // Get pages to move (either selected pages or just the dragged one)
    let pagesToMove: string[] = []
    if (selectedPageIds.has(active.id as string) && selectedPageIds.size > 1) {
      // Moving multiple selected pages - maintain their relative order
      pagesToMove = flatPages
        .filter(fp => selectedPageIds.has(fp.page.id))
        .map(fp => fp.page.id)
    } else {
      pagesToMove = [active.id as string]
    }

    // Create new order
    const newPages = flatPages.filter(fp => !pagesToMove.includes(fp.page.id))

    // Find insert position
    let insertIdx = newPages.findIndex(fp => fp.page.id === over.id)
    if (insertIdx === -1) insertIdx = newPages.length

    // If dragging forward, adjust insert position
    if (activeIdx < overIdx) {
      insertIdx++
    }

    // Insert moved pages at new position
    const movedPages = flatPages.filter(fp => pagesToMove.includes(fp.page.id))
    newPages.splice(insertIdx, 0, ...movedPages)

    // Only update pages whose sort_order actually changed
    const updates: { id: string; sort_order: number }[] = []
    for (let i = 0; i < newPages.length; i++) {
      const originalIdx = flatPages.findIndex(fp => fp.page.id === newPages[i].page.id)
      if (originalIdx !== i) {
        updates.push({ id: newPages[i].page.id, sort_order: i })
      }
    }

    if (updates.length === 0) return

    // INSTANT OPTIMISTIC UPDATE: Update local page order immediately
    // This directly controls the rendering order, bypassing the nested structure
    const newPageOrder = newPages.map(fp => fp.page.id)
    setLocalPageOrder(newPageOrder)

    // Mark moved pages for visual highlight
    setJustMovedPageIds(new Set(pagesToMove))

    // Clear selection
    clearSelection()

    // Show brief feedback
    showToast(`${pagesToMove.length > 1 ? pagesToMove.length + ' pages' : 'Page'} moved`, 'success')

    // Fire-and-forget database update (truly non-blocking)
    // Using an IIFE to keep the main function synchronous
    const supabase = createClient()
    void (async () => {
      try {
        await Promise.all(
          updates.map(({ id, sort_order }) =>
            supabase.from('pages').update({ sort_order }).eq('id', id)
          )
        )

        // Clear the "just moved" highlight after a delay
        setTimeout(() => {
          setJustMovedPageIds(new Set())
        }, 2000)
      } catch (error) {
        showToast('Failed to save reorder - please refresh', 'error')
        console.error('Reorder error:', error)
        setJustMovedPageIds(new Set())
        // On error, reset local page order to revert to server state
        setLocalPageOrder(null)
        router.refresh()
      }
    })()
  }, [flatPages, selectedPageIds, showToast, clearSelection, router])

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActivePageId(event.active.id as string)
  }, [])

  const savePageField = async (pageId: string, field: string, value: string) => {
    // Store previous value for rollback
    let previousValue: string | null = null
    for (const act of issue.acts) {
      for (const scene of act.scenes) {
        const page = scene.pages.find(p => p.id === pageId)
        if (page) {
          previousValue = (page as any)[field] ?? null
          break
        }
      }
    }

    // Optimistic update FIRST
    setIssue((prevIssue) => ({
      ...prevIssue,
      acts: prevIssue.acts.map((act) => ({
        ...act,
        scenes: act.scenes.map((scene) => ({
          ...scene,
          pages: scene.pages.map((page) =>
            page.id === pageId ? { ...page, [field]: value || null } : page
          ),
        })),
      })),
    }))
    // Then persist to database
    const supabase = createClient()
    const { error } = await supabase
      .from('pages')
      .update({ [field]: value || null })
      .eq('id', pageId)

    if (error) {
      // Rollback on error
      setIssue((prevIssue) => ({
        ...prevIssue,
        acts: prevIssue.acts.map((act) => ({
          ...act,
          scenes: act.scenes.map((scene) => ({
            ...scene,
            pages: scene.pages.map((page) =>
              page.id === pageId ? { ...page, [field]: previousValue } : page
            ),
          })),
        })),
      }))
      showToast(`Failed to save ${field}`, 'error')
    }
  }

  const assignPlotline = async (pageId: string, plotlineId: string | null) => {
    // Store previous value for rollback
    let previousPlotlineId: string | null = null
    let previousPlotline: Plotline | null = null
    for (const act of issue.acts) {
      for (const scene of act.scenes) {
        const page = scene.pages.find(p => p.id === pageId)
        if (page) {
          previousPlotlineId = page.plotline_id
          previousPlotline = page.plotline
          break
        }
      }
    }

    // Optimistic update FIRST
    const plotline = plotlineId ? issue.plotlines.find(p => p.id === plotlineId) || null : null
    setIssue((prevIssue) => ({
      ...prevIssue,
      acts: prevIssue.acts.map((act) => ({
        ...act,
        scenes: act.scenes.map((scene) => ({
          ...scene,
          pages: scene.pages.map((page) =>
            page.id === pageId ? { ...page, plotline_id: plotlineId, plotline } : page
          ),
        })),
      })),
    }))

    // Then persist to database
    const supabase = createClient()
    const { error } = await supabase
      .from('pages')
      .update({ plotline_id: plotlineId })
      .eq('id', pageId)

    if (error) {
      // Rollback on error
      setIssue((prevIssue) => ({
        ...prevIssue,
        acts: prevIssue.acts.map((act) => ({
          ...act,
          scenes: act.scenes.map((scene) => ({
            ...scene,
            pages: scene.pages.map((page) =>
              page.id === pageId ? { ...page, plotline_id: previousPlotlineId, plotline: previousPlotline } : page
            ),
          })),
        })),
      }))
      showToast('Failed to assign plotline', 'error')
    }
  }

  const createPlotline = async (plotlineName: string) => {
    if (!plotlineName.trim()) return

    const nextColor = PLOTLINE_COLORS[plotlines.length % PLOTLINE_COLORS.length]
    const tempId = `temp-plotline-${Date.now()}`
    const name = plotlineName.trim()

    // Optimistic update FIRST - add with temp ID
    const optimisticPlotline: Plotline = {
      id: tempId,
      name,
      color: nextColor,
      description: null,
      sort_order: plotlines.length,
    }
    setIssue((prevIssue) => ({
      ...prevIssue,
      plotlines: [...prevIssue.plotlines, optimisticPlotline],
    }))
    showToast('Plotline created', 'success')

    // Then persist to database
    const supabase = createClient()
    const { data: newPlotline, error } = await supabase
      .from('plotlines')
      .insert({
        issue_id: issue.id,
        name,
        color: nextColor,
        sort_order: plotlines.length,
      })
      .select()
      .single()

    if (error) {
      // Rollback on error
      setIssue((prevIssue) => ({
        ...prevIssue,
        plotlines: prevIssue.plotlines.filter(p => p.id !== tempId),
      }))
      showToast('Failed to create plotline', 'error')
    } else if (newPlotline) {
      // Replace temp ID with real ID
      setIssue((prevIssue) => ({
        ...prevIssue,
        plotlines: prevIssue.plotlines.map(p =>
          p.id === tempId ? { ...p, id: newPlotline.id } : p
        ),
      }))
    }
  }

  const deletePlotline = async (plotlineId: string) => {
    // Store for rollback
    const deletedPlotline = issue.plotlines.find(p => p.id === plotlineId)
    const pagesWithPlotline: string[] = []
    for (const act of issue.acts) {
      for (const scene of act.scenes) {
        for (const page of scene.pages) {
          if (page.plotline_id === plotlineId) {
            pagesWithPlotline.push(page.id)
          }
        }
      }
    }

    // Optimistic update FIRST
    setIssue((prevIssue) => ({
      ...prevIssue,
      plotlines: prevIssue.plotlines.filter(p => p.id !== plotlineId),
      // Also clear plotline_id from any pages that had it
      acts: prevIssue.acts.map((act) => ({
        ...act,
        scenes: act.scenes.map((scene) => ({
          ...scene,
          pages: scene.pages.map((page) =>
            page.plotline_id === plotlineId ? { ...page, plotline_id: null, plotline: null } : page
          ),
        })),
      })),
    }))
    showToast('Plotline deleted', 'success')

    // Then persist to database
    const supabase = createClient()
    const { error } = await supabase
      .from('plotlines')
      .delete()
      .eq('id', plotlineId)

    if (error) {
      // Rollback on error - restore plotline and page associations
      if (deletedPlotline) {
        setIssue((prevIssue) => ({
          ...prevIssue,
          plotlines: [...prevIssue.plotlines, deletedPlotline],
          acts: prevIssue.acts.map((act) => ({
            ...act,
            scenes: act.scenes.map((scene) => ({
              ...scene,
              pages: scene.pages.map((page) =>
                pagesWithPlotline.includes(page.id)
                  ? { ...page, plotline_id: plotlineId, plotline: deletedPlotline }
                  : page
              ),
            })),
          })),
        }))
      }
      showToast('Failed to delete plotline', 'error')
    }
  }

  const updatePlotlineColor = async (plotlineId: string, color: string) => {
    // Store previous color for rollback
    const previousColor = issue.plotlines.find(p => p.id === plotlineId)?.color

    // Optimistic update FIRST
    setIssue((prevIssue) => ({
      ...prevIssue,
      plotlines: prevIssue.plotlines.map(p =>
        p.id === plotlineId ? { ...p, color } : p
      ),
      // Also update the color for pages that reference this plotline
      acts: prevIssue.acts.map((act) => ({
        ...act,
        scenes: act.scenes.map((scene) => ({
          ...scene,
          pages: scene.pages.map((page) =>
            page.plotline_id === plotlineId && page.plotline
              ? { ...page, plotline: { ...page.plotline, color } }
              : page
          ),
        })),
      })),
    }))

    // Then persist to database
    const supabase = createClient()
    const { error } = await supabase
      .from('plotlines')
      .update({ color })
      .eq('id', plotlineId)

    if (error) {
      // Rollback on error
      if (previousColor) {
        setIssue((prevIssue) => ({
          ...prevIssue,
          plotlines: prevIssue.plotlines.map(p =>
            p.id === plotlineId ? { ...p, color: previousColor } : p
          ),
          acts: prevIssue.acts.map((act) => ({
            ...act,
            scenes: act.scenes.map((scene) => ({
              ...scene,
              pages: scene.pages.map((page) =>
                page.plotline_id === plotlineId && page.plotline
                  ? { ...page, plotline: { ...page.plotline, color: previousColor } }
                  : page
              ),
            })),
          })),
        }))
      }
      showToast('Failed to update color', 'error')
    }
  }

  const getPlotlineColor = useCallback((plotlineId: string | null): string => {
    if (!plotlineId) return 'var(--border)'
    const pl = plotlines.find(p => p.id === plotlineId)
    return pl?.color || 'var(--border)'
  }, [plotlines])

  const getScenePageCount = useCallback((sceneId: string): number => {
    const scene = allScenes.find(s => s.id === sceneId)
    return scene?.pages?.length || 0
  }, [allScenes])

  // Placeholder handlers for batch operations (Task 11)
  const handleMoveToScene = useCallback(async (_targetSceneId: string) => {
    // TODO: Implement in Task 11
    console.warn('handleMoveToScene not yet implemented')
  }, [])

  const handleBatchAssignPlotline = useCallback(async (_plotlineId: string) => {
    // TODO: Implement in Task 11
    console.warn('handleBatchAssignPlotline not yet implemented')
  }, [])

  // Empty state
  if (flatPages.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-12 text-center max-w-md">
          <div className="text-6xl mb-4 opacity-30">🧵</div>
          <h3 className="text-lg font-medium text-[var(--text-secondary)] mb-2">No pages to weave yet</h3>
          <p className="text-sm text-[var(--text-muted)] mb-6">
            The Weave shows your story beats arranged across physical page spreads.
            Add some pages to your issue first.
          </p>
          <Link
            href={`/series/${seriesId}/issues/${issue.id}`}
            className="inline-flex items-center gap-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] hover-lift px-4 py-2 rounded-lg font-medium"
          >
            ← Back to Editor
          </Link>
        </div>
      </div>
    )
  }

  // Group pages into visual spreads (for display only, drag is per-page)
  // Enhanced to handle linked spreads and splash pages
  // Cast because weave-spreads.FlatPage uses a minimal page shape; at runtime these are the same objects
  const spreads = computeSpreads(flatPages as Parameters<typeof computeSpreads>[0]) as Array<SpreadGroup & { left: FlatPage | null; right: FlatPage | null }>

  const sceneGroupedSpreads = useMemo(() => {
    const groups: Array<{ scene: Scene; spreads: typeof spreads }> = []
    let currentScene: Scene | null = null
    let currentGroup: typeof spreads = []

    for (const spread of spreads) {
      // Determine the scene for this spread (use left page's scene, or right if left is null/IFC)
      const spreadPage = spread.left || spread.right
      const scene = spreadPage ? (spreadPage as any).scene : null

      if (scene && scene.id !== currentScene?.id) {
        // New scene — flush current group
        if (currentScene && currentGroup.length > 0) {
          groups.push({ scene: currentScene, spreads: currentGroup })
        }
        currentScene = scene
        currentGroup = [spread]
      } else {
        currentGroup.push(spread)
      }
    }
    // Flush final group
    if (currentScene && currentGroup.length > 0) {
      groups.push({ scene: currentScene, spreads: currentGroup })
    }

    return groups
  }, [spreads])

  return (
    <div className="h-screen flex flex-col bg-[var(--bg-primary)]">
      <WeaveHeader
        issueNumber={issue.number}
        pageCount={flatPages.length}
        spreadCount={spreads.length}
        showPlotlineManager={showPlotlineManager}
        onTogglePlotlineManager={() => setShowPlotlineManager(!showPlotlineManager)}
        seriesId={seriesId}
        issueId={issue.id}
      />

      {showPlotlineManager && (
        <WeavePlotlineManager
          plotlines={plotlines}
          onCreatePlotline={createPlotline}
          onDeletePlotline={deletePlotline}
          onUpdateColor={updatePlotlineColor}
        />
      )}

      {selectedPageIds.size > 0 && (
        <WeaveSelectionToolbar
          selectedCount={selectedPageIds.size}
          scenes={allScenes}
          plotlines={plotlines}
          onMoveToScene={handleMoveToScene}
          onAssignPlotline={handleBatchAssignPlotline}
          onDeselectAll={clearSelection}
        />
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* Main flatplan area */}
        <div className="flex-1 overflow-auto p-5">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={flatPages.map(fp => fp.page.id)}
              strategy={horizontalListSortingStrategy}
            >
              {sceneGroupedSpreads.map(({ scene, spreads: sceneSpreads }) => (
                <WeaveSceneRegion
                  key={scene.id}
                  scene={scene}
                  plotlineColor={getPlotlineColor(scene.plotline_id)}
                  pageCount={getScenePageCount(scene.id)}
                  onSelectAll={handleSelectScene}
                >
                  {sceneSpreads.map((spread, i) => (
                    <WeaveSpread
                      key={spread.left?.page.id || spread.right?.page.id || `spread-${i}`}
                      spread={spread as SpreadGroup}
                      leftScene={spread.left ? (spread.left as any).scene : null}
                      rightScene={spread.right ? (spread.right as any).scene : null}
                    >
                      {/* Left card */}
                      {spread.isFirst && !spread.left ? (
                        null  /* WeaveSpread handles InsideCover internally for first spread */
                      ) : spread.left ? (
                        <WeavePageCard
                          page={spread.left as any}
                          isFirstPage={false}
                          isSelected={selectedPageIds.has(spread.left.page.id)}
                          isActive={activeDrawerPageId === spread.left.page.id}
                          isJustMoved={justMovedPageIds.has(spread.left.page.id)}
                          plotlines={plotlines}
                          onSelect={handleSelectPage}
                          onClick={setActiveDrawerPageId}
                          panelCount={pageStats.get(spread.left.page.id)?.panelCount ?? 0}
                          wordCount={pageStats.get(spread.left.page.id)?.wordCount ?? 0}
                        />
                      ) : null}
                      {/* Right card */}
                      {spread.right ? (
                        <WeavePageCard
                          page={spread.right as any}
                          isFirstPage={spread.isFirst}
                          isSelected={selectedPageIds.has(spread.right.page.id)}
                          isActive={activeDrawerPageId === spread.right.page.id}
                          isJustMoved={justMovedPageIds.has(spread.right.page.id)}
                          plotlines={plotlines}
                          onSelect={handleSelectPage}
                          onClick={setActiveDrawerPageId}
                          panelCount={pageStats.get(spread.right.page.id)?.panelCount ?? 0}
                          wordCount={pageStats.get(spread.right.page.id)?.wordCount ?? 0}
                        />
                      ) : null}
                    </WeaveSpread>
                  ))}
                </WeaveSceneRegion>
              ))}
            </SortableContext>
            <DragOverlay>
              {activePageId && (() => {
                const fp = flatPages.find(f => f.page.id === activePageId)
                if (!fp) return null
                const count = selectedPageIds.has(activePageId) ? selectedPageIds.size : 1
                return (
                  <div className="relative">
                    {count > 1 && (
                      <>
                        <div className="absolute -top-1 -left-1 w-[86px] h-[118px] bg-[var(--bg-tertiary)] rounded opacity-60 rotate-2" />
                        <div className="absolute -top-0.5 -left-0.5 w-[86px] h-[118px] bg-[var(--bg-tertiary)] rounded opacity-80 rotate-1" />
                      </>
                    )}
                    <div className="w-[86px] h-[118px] bg-[var(--bg-elevated)] border border-[var(--color-primary)] rounded shadow-lg p-2 relative">
                      <div className="text-2xl font-black text-[var(--text-primary)]"
                           style={{ fontFamily: "'Helvetica Neue', Helvetica, sans-serif" }}>
                        {fp.globalPageNumber}
                      </div>
                      {count > 1 && (
                        <div className="absolute top-1 right-1 bg-[var(--color-primary)] text-white text-[9px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                          {count}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })()}
            </DragOverlay>
          </DndContext>
        </div>

        {/* Side drawer */}
        {activeDrawerPageId && (() => {
          const drawerPage = flatPages.find(fp => fp.page.id === activeDrawerPageId)
          if (!drawerPage) return null
          return (
            <WeaveDrawer
              page={drawerPage as any}
              panelCount={pageStats.get(activeDrawerPageId)?.panelCount ?? 0}
              wordCount={pageStats.get(activeDrawerPageId)?.wordCount ?? 0}
              dialogueRatio={pageStats.get(activeDrawerPageId)?.dialogueRatio ?? 0}
              plotlines={plotlines}
              onClose={() => setActiveDrawerPageId(null)}
              onSaveStoryBeat={(pageId, value) => savePageField(pageId, 'story_beat', value)}
              onAssignPlotline={(pageId, plotlineId) => assignPlotline(pageId, plotlineId)}
              seriesId={seriesId}
              issueId={issue.id}
            />
          )
        })()}
      </div>
    </div>
  )
}
