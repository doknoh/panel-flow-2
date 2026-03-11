'use client'

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import NavigationTree from './NavigationTree'
import PageEditor from './PageEditor'
import PreviousPageContext, { findPreviousPage } from './PreviousPageContext'
import Toolkit from './Toolkit'
import FindReplaceModal from './FindReplaceModal'
import KeyboardShortcutsModal from './KeyboardShortcutsModal'
import JumpToPageModal from './JumpToPageModal'
import ZoomPanel from './ZoomPanel'
import ZenMode from './ZenMode'
import ScriptView from './ScriptView'
import QuickNav from './QuickNav'
import StatusBar from './StatusBar'
import ResizablePanels from '@/components/ResizablePanels'
import { exportIssueToPdf } from '@/lib/exportPdf'
import { exportIssueToDocx } from '@/lib/exportDocx'
import { exportIssueToTxt } from '@/lib/exportTxt'
import ExportModal, { type ExportOptions } from '@/components/ui/ExportModal'
import { useToast } from '@/contexts/ToastContext'
import { UndoProvider, useUndo } from '@/contexts/UndoContext'
import ThemeToggle from '@/components/ui/ThemeToggle'
import CommandPalette from '@/components/CommandPalette'

interface Plotline {
  id: string
  name: string
  color: string
  description: string | null
}

interface Issue {
  id: string
  number: number
  title: string | null
  summary: string | null
  themes: string | null
  tagline: string | null
  visual_style: string | null
  motifs: string | null
  stakes: string | null
  rules: string | null
  series_act: 'BEGINNING' | 'MIDDLE' | 'END' | null
  status: string
  writing_phase: string | null
  outline_notes: string | null
  series: {
    id: string
    title: string
    central_theme?: string | null
    logline?: string | null
    characters: any[]
    locations: any[]
    plotlines: Plotline[]
  }
  acts: any[]
}

// Recompute page_number for all pages based on their structural position
function stampPageNumbers<T extends { acts?: any[] }>(issueData: T): T {
  let pagePosition = 1
  return {
    ...issueData,
    acts: (issueData.acts || []).map((act: any) => ({
      ...act,
      scenes: (act.scenes || []).map((scene: any) => ({
        ...scene,
        pages: (scene.pages || []).map((page: any) => {
          const stamped = { ...page, page_number: pagePosition }
          pagePosition++
          return stamped
        })
      }))
    }))
  }
}

export default function IssueEditor({ issue: initialIssue, seriesId }: { issue: Issue; seriesId: string }) {
  const [issueRaw, setIssue] = useState(initialIssue)
  // Derive issue with correct page_number values computed from structural position
  const issue = useMemo(() => stampPageNumbers(issueRaw), [issueRaw])
  const [refreshKey, setRefreshKey] = useState(0)
  const [selectedPageId, setSelectedPageId] = useState<string | null>(() => {
    return initialIssue.acts?.[0]?.scenes?.[0]?.pages?.[0]?.id || null
  })
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved')
  const [isFindReplaceOpen, setIsFindReplaceOpen] = useState(false)
  const [isZoomPanelOpen, setIsZoomPanelOpen] = useState(false)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editedTitle, setEditedTitle] = useState(issue.title || '')
  const [filedNotes, setFiledNotes] = useState<Array<{ id: string; title: string; content: string | null; item_type: string; filed_to_page_id: string; filed_at: string }>>([])
  const titleInputRef = useRef<HTMLInputElement>(null)
  const { showToast } = useToast()
  const lastSnapshotRef = useRef<string>('')
  const snapshotTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Find the selected page data along with its Act/Scene context
  const selectedPageContext = (() => {
    if (!selectedPageId) return null
    for (const act of (issue.acts || [])) {
      for (const scene of (act.scenes || [])) {
        const pageIndex = (scene.pages || []).findIndex((p: any) => p.id === selectedPageId)
        if (pageIndex !== -1) {
          const page = scene.pages[pageIndex]
          return {
            page,
            act: { id: act.id, name: act.name, number: act.number, sort_order: act.sort_order },
            scene: {
              id: scene.id,
              name: scene.title || scene.name,
              sort_order: scene.sort_order,
              plotline_name: scene.plotline?.name || null,
              total_pages: (scene.pages || []).length,
            },
            pagePositionInScene: pageIndex + 1,
          }
        }
      }
    }
    return null
  })()

  const selectedPage = selectedPageContext?.page

  // Find the previous page for context
  const previousPageData = selectedPageId
    ? findPreviousPage(issue.acts, selectedPageId)
    : null

  // Auto-select first page if current selection is invalid (e.g., page deleted)
  useEffect(() => {
    if (!selectedPage && issue.acts?.length) {
      const firstPage = issue.acts?.[0]?.scenes?.[0]?.pages?.[0]
      if (firstPage) {
        setSelectedPageId(firstPage.id)
      }
    }
  }, [issue, selectedPage])

  // Load canvas items filed to pages in this issue
  useEffect(() => {
    const loadFiledNotes = async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('canvas_items')
        .select('id, title, content, item_type, filed_to_page_id, filed_at')
        .eq('series_id', seriesId)
        .not('filed_to_page_id', 'is', null)
        .eq('archived', false)
      if (data) setFiledNotes(data)
    }
    loadFiledNotes()
  }, [seriesId])

  // Focus title input when editing starts
  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus()
      titleInputRef.current.select()
    }
  }, [isEditingTitle])

  const saveTitle = async () => {
    const trimmedTitle = editedTitle.trim()
    if (trimmedTitle === (issue.title || '')) {
      setIsEditingTitle(false)
      return
    }

    const previousTitle = issue.title

    // Optimistic update FIRST
    setIssue(prev => ({ ...prev, title: trimmedTitle || null }))
    setIsEditingTitle(false)
    showToast('Title updated', 'success')

    // Then persist to database
    const supabase = createClient()
    const { error } = await supabase
      .from('issues')
      .update({ title: trimmedTitle || null })
      .eq('id', issue.id)

    if (error) {
      // Rollback on error
      setIssue(prev => ({ ...prev, title: previousTitle }))
      setEditedTitle(previousTitle || '')
      showToast('Failed to save title', 'error')
    }
  }

  const refreshIssue = useCallback(async () => {
    const supabase = createClient()

    // Fetch issue structure and plotlines separately to avoid PostgREST FK join failures
    // (plotline:plotline_id join can fail if any scene has a dangling FK reference)
    const [issueResult, actsResult, plotlinesResult] = await Promise.all([
      supabase
        .from('issues')
        .select(`
          *,
          series:series_id (
            id,
            title,
            characters (*),
            locations (*)
          )
        `)
        .eq('id', initialIssue.id)
        .single(),
      supabase
        .from('acts')
        .select(`
          *,
          scenes (
            *,
            pages (
              *,
              panels (
                *,
                dialogue_blocks (*, character:character_id (id, name)),
                captions (*),
                sound_effects (*)
              )
            )
          )
        `)
        .eq('issue_id', initialIssue.id)
        .order('sort_order', { ascending: true }),
      supabase
        .from('plotlines')
        .select('*')
        .eq('series_id', initialIssue.series.id)
        .order('sort_order')
    ])

    const { data, error } = issueResult

    if (error) {
      console.error('refreshIssue: FAILED to refresh issue:', error.message, '| code:', error.code, '| details:', error.details, '| hint:', error.hint)
      return
    }

    // Merge acts and plotlines into issue data
    if (data) {
      data.acts = actsResult.data || []
      if (plotlinesResult.data) {
        data.series.plotlines = plotlinesResult.data
      }

      // Resolve plotline names onto scenes from the separately-fetched plotlines
      const plotlineMap = new Map((plotlinesResult.data || []).map((p: any) => [p.id, p]))
      for (const act of data.acts) {
        for (const scene of (act.scenes || [])) {
          scene.plotline = scene.plotline_id ? plotlineMap.get(scene.plotline_id) || null : null
        }
      }
    }

    if (actsResult.error) {
      console.error('refreshIssue: FAILED to refresh acts:', actsResult.error.message)
    }

    if (data) {
      // Sort acts, scenes, and pages by sort_order for consistent display
      const sortedData = {
        ...data,
        acts: (data.acts || [])
          .sort((a: any, b: any) => a.sort_order - b.sort_order)
          .map((act: any) => ({
            ...act,
            scenes: (act.scenes || [])
              .sort((a: any, b: any) => a.sort_order - b.sort_order)
              .map((scene: any) => ({
                ...scene,
                pages: (scene.pages || [])
                  .sort((a: any, b: any) => a.sort_order - b.sort_order)
                  .map((page: any) => ({
                    ...page,
                    panels: (page.panels || []).sort((a: any, b: any) => a.sort_order - b.sort_order)
                  }))
              }))
          }))
      }
      setIssue(sortedData)
      setRefreshKey(k => k + 1)
    }
  }, [initialIssue.id])

  // Create snapshot of current state
  const createSnapshot = useCallback(async () => {
    const supabase = createClient()

    // Get all pages with their panels
    const pages = issue.acts
      ?.flatMap(act => act.scenes || [])
      ?.flatMap(scene => scene.pages || [])
      ?.map(page => ({
        id: page.id,
        page_number: page.page_number,
        panels: (page.panels || []).map((panel: any) => ({
          id: panel.id,
          panel_number: panel.panel_number,
          visual_description: panel.visual_description,
          dialogue_blocks: (panel.dialogue_blocks || []).map((db: any) => ({ text: db.text })),
          captions: (panel.captions || []).map((c: any) => ({ text: c.text })),
          sound_effects: (panel.sound_effects || []).map((sfx: any) => ({ text: sfx.text })),
        })),
      })) || []

    const snapshotKey = JSON.stringify(pages)

    // Don't save if nothing changed
    if (snapshotKey === lastSnapshotRef.current) return

    lastSnapshotRef.current = snapshotKey

    const { error } = await supabase.from('version_snapshots').insert({
      issue_id: issue.id,
      snapshot_data: { pages },
    })

    if (!error) {
      // Keep only last 10 snapshots
      const { data: allSnapshots } = await supabase
        .from('version_snapshots')
        .select('id')
        .eq('issue_id', issue.id)
        .order('created_at', { ascending: false })

      if (allSnapshots && allSnapshots.length > 10) {
        const toDelete = allSnapshots.slice(10).map(s => s.id)
        await supabase.from('version_snapshots').delete().in('id', toDelete)
      }
    }
  }, [issue])

  // Auto-snapshot every 5 minutes
  useEffect(() => {
    snapshotTimerRef.current = setInterval(() => {
      createSnapshot()
    }, 5 * 60 * 1000) // 5 minutes

    return () => {
      if (snapshotTimerRef.current) {
        clearInterval(snapshotTimerRef.current)
      }
    }
  }, [createSnapshot])

  // Create snapshot on first load
  useEffect(() => {
    const timer = setTimeout(() => {
      createSnapshot()
    }, 3000) // Wait 3 seconds for data to settle

    return () => clearTimeout(timer)
  }, [])

  // Warn user before leaving with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (saveStatus === 'unsaved') {
        e.preventDefault()
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?'
        return e.returnValue
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [saveStatus])

  // Handle navigation from Find & Replace
  const handleNavigateToPanel = useCallback((pageId: string, panelId: string) => {
    setSelectedPageId(pageId)
    // TODO: Could also scroll to and highlight the specific panel
  }, [])

  return (
    <UndoProvider onRefresh={refreshIssue}>
      <IssueEditorContent
        issue={issue}
        setIssue={setIssue}
        seriesId={seriesId}
        refreshKey={refreshKey}
        selectedPageId={selectedPageId}
        setSelectedPageId={setSelectedPageId}
        selectedPage={selectedPage}
        selectedPageContext={selectedPageContext}
        previousPageData={previousPageData}
        saveStatus={saveStatus}
        setSaveStatus={setSaveStatus}
        isFindReplaceOpen={isFindReplaceOpen}
        setIsFindReplaceOpen={setIsFindReplaceOpen}
        isZoomPanelOpen={isZoomPanelOpen}
        setIsZoomPanelOpen={setIsZoomPanelOpen}
        refreshIssue={refreshIssue}
        handleNavigateToPanel={handleNavigateToPanel}
        showToast={showToast}
        isEditingTitle={isEditingTitle}
        setIsEditingTitle={setIsEditingTitle}
        editedTitle={editedTitle}
        setEditedTitle={setEditedTitle}
        titleInputRef={titleInputRef}
        saveTitle={saveTitle}
        filedNotes={filedNotes}
      />
    </UndoProvider>
  )
}

// Inner component that can use the useUndo hook
type MobileView = 'nav' | 'editor' | 'toolkit'

interface PageContext {
  page: any
  act: { id: string; name: string; sort_order: number }
  scene: { id: string; name: string; sort_order: number; plotline_name?: string | null; total_pages?: number }
  pagePositionInScene?: number
}

function IssueEditorContent({
  issue,
  setIssue,
  seriesId,
  refreshKey,
  selectedPageId,
  setSelectedPageId,
  selectedPage,
  selectedPageContext,
  previousPageData,
  saveStatus,
  setSaveStatus,
  isFindReplaceOpen,
  setIsFindReplaceOpen,
  isZoomPanelOpen,
  setIsZoomPanelOpen,
  refreshIssue,
  handleNavigateToPanel,
  showToast,
  isEditingTitle,
  setIsEditingTitle,
  editedTitle,
  setEditedTitle,
  titleInputRef,
  saveTitle,
  filedNotes,
}: {
  issue: Issue
  setIssue: React.Dispatch<React.SetStateAction<Issue>>
  seriesId: string
  refreshKey: number
  selectedPageId: string | null
  setSelectedPageId: (id: string | null) => void
  selectedPage: any
  selectedPageContext: PageContext | null
  previousPageData: { page: any; sceneName: string | null } | null
  saveStatus: 'saved' | 'saving' | 'unsaved'
  setSaveStatus: (status: 'saved' | 'saving' | 'unsaved') => void
  isFindReplaceOpen: boolean
  setIsFindReplaceOpen: (open: boolean) => void
  isZoomPanelOpen: boolean
  setIsZoomPanelOpen: (open: boolean) => void
  refreshIssue: () => void
  handleNavigateToPanel: (pageId: string, panelId: string) => void
  showToast: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void
  isEditingTitle: boolean
  setIsEditingTitle: (editing: boolean) => void
  editedTitle: string
  setEditedTitle: (title: string) => void
  titleInputRef: React.RefObject<HTMLInputElement | null>
  saveTitle: () => Promise<void>
  filedNotes: Array<{ id: string; title: string; content: string | null; item_type: string; filed_to_page_id: string; filed_at: string }>
}) {
  const { undo, redo, canUndo, canRedo } = useUndo()
  const [mobileView, setMobileView] = useState<MobileView>('editor')
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false)
  const [isJumpToPageOpen, setIsJumpToPageOpen] = useState(false)
  const [isZenMode, setIsZenMode] = useState(false)
  const [isScriptView, setIsScriptView] = useState(false)
  const [isQuickNavOpen, setIsQuickNavOpen] = useState(false)
  const [isLeftCollapsed, setIsLeftCollapsed] = useState(false)
  const [isRightCollapsed, setIsRightCollapsed] = useState(false)
  const [peekPageId, setPeekPageId] = useState<string | null>(null)
  const [openDropdown, setOpenDropdown] = useState<'view' | 'navigate' | 'export' | null>(null)
  const [showExportModal, setShowExportModal] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown on click outside
  useEffect(() => {
    if (!openDropdown) return
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdown(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [openDropdown])

  // Get all pages in order for navigation
  const allPages = React.useMemo(() => {
    const pages: { id: string; pageNumber: number; sceneId: string; actId: string }[] = []
    for (const act of issue.acts || []) {
      for (const scene of act.scenes || []) {
        for (const page of scene.pages || []) {
          pages.push({
            id: page.id,
            pageNumber: page.page_number,
            sceneId: scene.id,
            actId: act.id,
          })
        }
      }
    }
    // Sort by act order, scene order, page number
    return pages
  }, [issue.acts])

  // Get scene pages for the current page (used for spread linking)
  const currentScenePages = React.useMemo(() => {
    if (!selectedPageContext?.scene?.id) return []
    for (const act of issue.acts || []) {
      for (const scene of act.scenes || []) {
        if (scene.id === selectedPageContext.scene.id) {
          return (scene.pages || []).map((p: any) => ({
            id: p.id,
            page_number: p.page_number,
            page_type: p.page_type || 'SINGLE',
            linked_page_id: p.linked_page_id || null,
          }))
        }
      }
    }
    return []
  }, [issue.acts, selectedPageContext?.scene?.id])

  // Peek page data — find full page data for the peek overlay
  const peekPageData = React.useMemo(() => {
    if (!peekPageId) return null
    for (const act of issue.acts || []) {
      for (const scene of act.scenes || []) {
        const page = (scene.pages || []).find((p: any) => p.id === peekPageId)
        if (page) return page
      }
    }
    return null
  }, [issue.acts, peekPageId])

  // Clear peek overlay when navigating to a different page
  useEffect(() => {
    setPeekPageId(null)
  }, [selectedPageId])

  // Navigation helpers
  const navigateToPage = useCallback((direction: 'prev' | 'next') => {
    if (!selectedPageId || allPages.length === 0) return

    const currentIndex = allPages.findIndex(p => p.id === selectedPageId)
    if (currentIndex === -1) return

    const newIndex = direction === 'prev' ? currentIndex - 1 : currentIndex + 1
    if (newIndex >= 0 && newIndex < allPages.length) {
      setSelectedPageId(allPages[newIndex].id)
      showToast(`Page ${allPages[newIndex].pageNumber}`, 'info')
    }
  }, [selectedPageId, allPages, setSelectedPageId, showToast])

  // Add a new page to a scene (for Cmd+P shortcut)
  const addPageToScene = useCallback(async (sceneId: string) => {
    const allPagesFlat = issue.acts?.flatMap((a: any) =>
      a.scenes?.flatMap((s: any) => s.pages || []) || []
    ) || []
    const pageNumber = allPagesFlat.length + 1

    const scene = issue.acts?.flatMap((a: any) => a.scenes || []).find((s: any) => s.id === sceneId)
    const pagesInScene = scene?.pages?.length || 0
    const tempId = `temp-page-${Date.now()}`

    // Optimistic update
    const optimisticPage = {
      id: tempId,
      scene_id: sceneId,
      page_number: pageNumber,
      sort_order: pagesInScene + 1,
      title: `Page ${pageNumber}`,
      panels: [],
    }
    setIssue((prev: any) => ({
      ...prev,
      acts: prev.acts.map((a: any) => ({
        ...a,
        scenes: (a.scenes || []).map((s: any) =>
          s.id === sceneId
            ? { ...s, pages: [...(s.pages || []), optimisticPage] }
            : s
        ),
      })),
    }))
    setSelectedPageId(tempId)
    showToast(`Page ${pageNumber} created`, 'success')

    // Persist to database
    const supabase = createClient()
    const { data: newPage, error } = await supabase.from('pages').insert({
      scene_id: sceneId,
      page_number: pageNumber,
      sort_order: pagesInScene + 1,
      title: `Page ${pageNumber}`,
    }).select().single()

    if (error) {
      // Rollback on error
      setIssue((prev: any) => ({
        ...prev,
        acts: prev.acts.map((a: any) => ({
          ...a,
          scenes: (a.scenes || []).map((s: any) =>
            s.id === sceneId
              ? { ...s, pages: (s.pages || []).filter((p: any) => p.id !== tempId) }
              : s
          ),
        })),
      }))
      setSelectedPageId(null)
      showToast(`Failed to create page: ${error.message}`, 'error')
    } else if (newPage) {
      // Replace temp ID with real ID
      setIssue((prev: any) => ({
        ...prev,
        acts: prev.acts.map((a: any) => ({
          ...a,
          scenes: (a.scenes || []).map((s: any) =>
            s.id === sceneId
              ? { ...s, pages: (s.pages || []).map((p: any) => p.id === tempId ? { ...p, id: newPage.id } : p) }
              : s
          ),
        })),
      }))
      setSelectedPageId(newPage.id)
    }
  }, [issue.acts, setIssue, setSelectedPageId, showToast])

  const navigateToScene = useCallback((direction: 'prev' | 'next') => {
    if (!selectedPageId || allPages.length === 0) return

    const currentPage = allPages.find(p => p.id === selectedPageId)
    if (!currentPage) return

    // Find the first page of the previous/next scene
    const currentSceneId = currentPage.sceneId
    let targetSceneFirstPage: typeof allPages[0] | null = null

    if (direction === 'prev') {
      // Find the last scene before current
      for (let i = allPages.length - 1; i >= 0; i--) {
        if (allPages[i].sceneId !== currentSceneId) {
          // Find the first page of this scene
          const sceneId = allPages[i].sceneId
          for (let j = 0; j <= i; j++) {
            if (allPages[j].sceneId === sceneId) {
              targetSceneFirstPage = allPages[j]
              break
            }
          }
          break
        }
      }
    } else {
      // Find the first page after current scene ends
      let passedCurrentScene = false
      for (const page of allPages) {
        if (page.sceneId === currentSceneId) {
          passedCurrentScene = true
        } else if (passedCurrentScene) {
          targetSceneFirstPage = page
          break
        }
      }
    }

    if (targetSceneFirstPage) {
      setSelectedPageId(targetSceneFirstPage.id)
      showToast(`Scene changed`, 'info')
    }
  }, [selectedPageId, allPages, setSelectedPageId, showToast])

  // Keyboard shortcuts including undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey

      // Cmd/Ctrl + Z for Undo
      if (isMod && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        if (canUndo) {
          undo()
        }
        return
      }

      // Cmd/Ctrl + Shift + Z for Redo (only when not in Zen mode)
      if (isMod && e.key === 'z' && e.shiftKey && !isZenMode) {
        e.preventDefault()
        if (canRedo) {
          redo()
        }
        return
      }

      // Cmd/Ctrl + Shift + Z for Zen Mode toggle (when 'Z' is uppercase/shift held)
      // We use a different key to avoid conflict: Cmd+Shift+Enter for Zen Mode
      if (isMod && e.shiftKey && e.key === 'Enter') {
        e.preventDefault()
        if (isZenMode) {
          setIsZenMode(false)
        } else {
          // Refresh data before opening Zen mode to ensure panels are synced
          void (async () => {
            await refreshIssue()
            setIsZenMode(true)
          })()
        }
        return
      }

      // Cmd/Ctrl + F for Find & Replace
      if (isMod && e.key === 'f') {
        e.preventDefault()
        setIsFindReplaceOpen(true)
        return
      }

      // Cmd/Ctrl + . for Zoom Panel (Context Ladder)
      if (isMod && e.key === '.') {
        e.preventDefault()
        setIsZoomPanelOpen(!isZoomPanelOpen)
        return
      }

      // Cmd/Ctrl + [ to toggle left panel
      if (isMod && e.key === '[') {
        e.preventDefault()
        setIsLeftCollapsed(prev => !prev)
        return
      }

      // Cmd/Ctrl + ] to toggle right panel
      if (isMod && e.key === ']') {
        e.preventDefault()
        setIsRightCollapsed(prev => !prev)
        return
      }

      // Cmd/Ctrl + S for force save (visual confirmation)
      if (isMod && e.key === 's') {
        e.preventDefault()
        if (saveStatus === 'saved') {
          showToast('All changes saved', 'success')
        }
        return
      }

      // ? for keyboard shortcuts help (when not in an input)
      if (e.key === '?' && !isMod) {
        const activeElement = document.activeElement
        const isInput = activeElement instanceof HTMLInputElement ||
                       activeElement instanceof HTMLTextAreaElement ||
                       activeElement?.getAttribute('contenteditable') === 'true'
        if (!isInput) {
          e.preventDefault()
          setIsShortcutsOpen(true)
          return
        }
      }

      // Navigation shortcuts
      // Cmd/Ctrl + Arrow Up = Previous page
      if (isMod && e.key === 'ArrowUp' && !e.shiftKey) {
        e.preventDefault()
        navigateToPage('prev')
        return
      }

      // Cmd/Ctrl + Arrow Down = Next page
      if (isMod && e.key === 'ArrowDown' && !e.shiftKey) {
        e.preventDefault()
        navigateToPage('next')
        return
      }

      // Cmd/Ctrl + Shift + Arrow Up = Previous scene
      if (isMod && e.key === 'ArrowUp' && e.shiftKey) {
        e.preventDefault()
        navigateToScene('prev')
        return
      }

      // Cmd/Ctrl + Shift + Arrow Down = Next scene
      if (isMod && e.key === 'ArrowDown' && e.shiftKey) {
        e.preventDefault()
        navigateToScene('next')
        return
      }

      // Cmd/Ctrl + J = Jump to page
      if (isMod && e.key === 'j') {
        e.preventDefault()
        setIsJumpToPageOpen(true)
        return
      }

      // Cmd/Ctrl + K = Quick navigation palette
      if (isMod && e.key === 'k') {
        e.preventDefault()
        setIsQuickNavOpen(true)
        return
      }

      // Alt + Arrow Up/Down = Quick page peek (prev/next page preview)
      if (e.altKey && !isMod && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault()
        if (!selectedPageId || allPages.length === 0) return
        const currentIndex = allPages.findIndex(p => p.id === selectedPageId)
        if (currentIndex === -1) return
        const peekIndex = e.key === 'ArrowUp' ? currentIndex - 1 : currentIndex + 1
        if (peekIndex >= 0 && peekIndex < allPages.length) {
          setPeekPageId(prev => prev === allPages[peekIndex].id ? null : allPages[peekIndex].id)
        }
        return
      }

      // Cmd/Ctrl + P = Add new page to current scene
      if (isMod && e.key === 'p') {
        e.preventDefault()
        if (selectedPageContext?.scene?.id) {
          addPageToScene(selectedPageContext.scene.id)
        } else {
          showToast('Select a page first to add a new page to its scene', 'warning')
        }
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [canUndo, canRedo, undo, redo, saveStatus, showToast, setIsFindReplaceOpen, setIsShortcutsOpen, navigateToPage, navigateToScene, selectedPageContext, addPageToScene, isZenMode, selectedPageId, allPages])

  return (
    <div className="h-screen flex flex-col bg-[var(--bg-primary)] text-[var(--text-primary)]">
      {/* Header */}
      <header className="border-b border-[var(--text-primary)] px-4 py-3 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <Link href={`/series/${seriesId}`} className="type-meta text-[var(--text-muted)] hover:text-[var(--text-primary)] shrink-0" aria-label="Back to series">
              ←
            </Link>
            <span className="text-2xl font-black tracking-[-0.04em] shrink-0 leading-none">ISSUE #{String(issue.number).padStart(2, '0')}</span>
            <span className="type-separator hidden sm:inline shrink-0">{'\/\/'}</span>
            {isEditingTitle ? (
              <input
                ref={titleInputRef}
                type="text"
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveTitle()
                  if (e.key === 'Escape') {
                    setEditedTitle(issue.title || '')
                    setIsEditingTitle(false)
                  }
                }}
                className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded px-2 py-0.5 text-[var(--text-primary)] min-w-[150px] max-w-[300px]"
                placeholder="Issue title..."
              />
            ) : (
              <button
                onClick={() => {
                  setEditedTitle(issue.title || '')
                  setIsEditingTitle(true)
                }}
                className="font-light tracking-normal text-[var(--text-secondary)] hover:text-[var(--text-primary)] hidden sm:inline truncate max-w-[300px] text-left group active:scale-[0.97] transition-all duration-150 ease-out"
                title="Click to edit title"
              >
                {issue.title || <span className="italic text-[var(--text-muted)]">Add title...</span>}
                <svg className="w-3 h-3 inline ml-1 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>
            )}
          </div>
          <div ref={dropdownRef} className="flex items-center gap-1.5 md:gap-2">
            {/* Direct access: Find */}
            <button
              onClick={() => setIsFindReplaceOpen(true)}
              className="type-meta px-2 py-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] hidden md:block active:scale-[0.97] transition-all duration-150 ease-out"
              title="Find & Replace (⌘F)"
            >
              FIND
            </button>

            {/* View dropdown */}
            <div className="relative hidden md:block">
              <button
                onClick={() => setOpenDropdown(openDropdown === 'view' ? null : 'view')}
                className={`type-meta px-2 py-1 active:scale-[0.97] transition-all duration-150 ease-out ${openDropdown === 'view' ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
              >
                VIEW
              </button>
              {openDropdown === 'view' && (
                <div className="dropdown-panel absolute right-0 top-full mt-1 py-1 w-48 z-50">
                  <button
                    onClick={() => { setIsZoomPanelOpen(!isZoomPanelOpen); setOpenDropdown(null) }}
                    className={`dropdown-item justify-between ${isZoomPanelOpen ? 'active' : ''}`}
                  >
                    <span>Zoom</span>
                    <span className="text-xs opacity-40 font-mono">Cmd+.</span>
                  </button>
                  <button
                    onClick={async () => { await refreshIssue(); setIsZenMode(true); setOpenDropdown(null) }}
                    className="dropdown-item justify-between"
                  >
                    <span>Zen Mode</span>
                    <span className="text-xs opacity-40 font-mono">Cmd+Shift+Enter</span>
                  </button>
                  <button
                    onClick={async () => { await refreshIssue(); setIsScriptView(true); setOpenDropdown(null) }}
                    className="dropdown-item"
                  >
                    Script View
                  </button>
                  <Link
                    href={`/series/${seriesId}/issues/${issue.id}/read`}
                    className="dropdown-item"
                    onClick={() => setOpenDropdown(null)}
                  >
                    Read Mode
                  </Link>
                  <div className="dropdown-separator my-1" />
                  <button
                    onClick={() => { setIsShortcutsOpen(true); setOpenDropdown(null) }}
                    className="dropdown-item justify-between"
                  >
                    <span>Keyboard Shortcuts</span>
                    <span className="text-xs opacity-40 font-mono">?</span>
                  </button>
                </div>
              )}
            </div>

            {/* Navigate dropdown */}
            <div className="relative hidden md:block">
              <button
                onClick={() => setOpenDropdown(openDropdown === 'navigate' ? null : 'navigate')}
                className={`type-meta px-2 py-1 active:scale-[0.97] transition-all duration-150 ease-out ${openDropdown === 'navigate' ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
              >
                TOOLS
              </button>
              {openDropdown === 'navigate' && (
                <div className="dropdown-panel absolute right-0 top-full mt-1 py-1 w-44 z-50">
                  <Link
                    href={`/series/${seriesId}/issues/${issue.id}/import`}
                    className="dropdown-item"
                    onClick={() => setOpenDropdown(null)}
                  >
                    Import Script
                  </Link>
                  <Link
                    href={`/series/${seriesId}/issues/${issue.id}/weave`}
                    className="dropdown-item"
                    onClick={() => setOpenDropdown(null)}
                  >
                    Weave
                  </Link>
                  <Link
                    href={`/series/${seriesId}/issues/${issue.id}/scene-analytics`}
                    className="dropdown-item"
                    onClick={() => setOpenDropdown(null)}
                  >
                    Analytics
                  </Link>
                  <Link
                    href={`/series/${seriesId}/issues/${issue.id}/rhythm`}
                    className="dropdown-item"
                    onClick={() => setOpenDropdown(null)}
                  >
                    Rhythm
                  </Link>
                  <Link
                    href={`/series/${seriesId}/guide?issue=${issue.id}`}
                    className="dropdown-item"
                    onClick={() => setOpenDropdown(null)}
                  >
                    Guide
                  </Link>
                  <Link
                    href={`/series/${seriesId}/issues/${issue.id}/history`}
                    className="dropdown-item"
                    onClick={() => setOpenDropdown(null)}
                  >
                    History
                  </Link>
                </div>
              )}
            </div>

            {/* Export button + modal */}
            <button
              onClick={() => setShowExportModal(true)}
              className="type-meta px-2 md:px-3 py-1.5 active:scale-[0.97] transition-all duration-150 ease-out border border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
            >
              EXPORT
            </button>
            <ExportModal
              open={showExportModal}
              onCancel={() => setShowExportModal(false)}
              onExport={async (opts: ExportOptions) => {
                setShowExportModal(false)
                try {
                  if (opts.format === 'pdf') {
                    exportIssueToPdf(issue, { includeSummary: opts.includeSummary, includeNotes: opts.includeNotes })
                  } else if (opts.format === 'docx') {
                    await exportIssueToDocx(issue, opts.includeNotes, { includeSummary: opts.includeSummary })
                  } else {
                    exportIssueToTxt(issue, { includeSummary: opts.includeSummary, includeNotes: opts.includeNotes })
                  }
                  showToast(`${opts.format.toUpperCase()} exported successfully`, 'success')
                } catch (error) {
                  showToast(`Failed to export ${opts.format.toUpperCase()}`, 'error')
                  console.error('Export error:', error)
                }
              }}
            />

            <ThemeToggle />
          </div>
        </div>

        {/* Mobile view switcher */}
        <div className="flex md:hidden mt-3 gap-1 border-t border-[var(--border)] pt-3 -mx-4 px-4">
          <button
            onClick={() => setMobileView('nav')}
            className={`flex-1 py-2 type-meta active:scale-[0.97] transition-all duration-150 ease-out ${mobileView === 'nav' ? 'border-b-2 border-[var(--text-primary)] text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}
          >
            NAV
          </button>
          <button
            onClick={() => setMobileView('editor')}
            className={`flex-1 py-2 type-meta active:scale-[0.97] transition-all duration-150 ease-out ${mobileView === 'editor' ? 'border-b-2 border-[var(--text-primary)] text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}
          >
            EDITOR
          </button>
          <button
            onClick={() => setMobileView('toolkit')}
            className={`flex-1 py-2 type-meta active:scale-[0.97] transition-all duration-150 ease-out ${mobileView === 'toolkit' ? 'border-b-2 border-[var(--text-primary)] text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}
          >
            TOOLKIT
          </button>
        </div>
      </header>

      {/* Main Three-Column Layout - Desktop */}
      <div className="hidden md:flex flex-1 overflow-hidden">
        <ResizablePanels
          storageKey="issue-editor-panels"
          leftMinWidth={180}
          leftMaxWidth={400}
          rightMinWidth={200}
          rightMaxWidth={500}
          defaultLeftWidth={256}
          defaultRightWidth={320}
          isLeftCollapsed={isLeftCollapsed}
          isRightCollapsed={isRightCollapsed}
          onLeftCollapseChange={setIsLeftCollapsed}
          onRightCollapseChange={setIsRightCollapsed}
          leftPanel={
            <div className="h-full border-r border-[var(--border)]">
              <NavigationTree
                key={refreshKey}
                issue={issue}
                setIssue={setIssue}
                plotlines={issue.series.plotlines || []}
                selectedPageId={selectedPageId}
                onSelectPage={(pageId) => {
                  setSelectedPageId(pageId)
                }}
                onRefresh={refreshIssue}
              />
            </div>
          }
          centerPanel={
            selectedPage ? (
              <div className="flex flex-col h-full">
                {/* Previous page context */}
                <PreviousPageContext
                  previousPage={previousPageData?.page || null}
                  sceneName={previousPageData?.sceneName}
                />
                {/* Current page editor — keyed for transition animation */}
                <div key={selectedPage.id} className="flex-1 overflow-y-auto" style={{ animation: 'page-enter 150ms ease-out' }}>
                  <PageEditor
                    page={selectedPage}
                    pageContext={selectedPageContext}
                    characters={issue.series.characters}
                    locations={issue.series.locations}
                    scenePages={currentScenePages}
                    onUpdate={refreshIssue}
                    setSaveStatus={setSaveStatus}
                    filedNotes={filedNotes.filter(n => n.filed_to_page_id === selectedPage?.id)}
                  />
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-[var(--text-muted)]">
                <div className="text-center p-8 max-w-md">
                  <div className="text-5xl mb-4 opacity-30">📄</div>
                  <h3 className="text-lg font-medium text-[var(--text-secondary)] mb-2">No pages yet</h3>
                  <p className="text-sm text-[var(--text-muted)] mb-6">
                    Start by creating an act and scene in the navigation tree on the left. Each scene can contain multiple pages, and each page holds your comic panels.
                  </p>
                  <div className="text-xs text-[var(--text-muted)] space-y-1">
                    <p>💡 Tip: Use <kbd className="px-1 py-0.5 bg-[var(--bg-secondary)] border border-[var(--border)] rounded">?</kbd> to see keyboard shortcuts</p>
                  </div>
                </div>
              </div>
            )
          }
          rightPanel={
            <div className="h-full border-l border-[var(--border)]">
              <Toolkit
                issue={issue}
                selectedPageContext={selectedPageContext}
                onRefresh={refreshIssue}
              />
            </div>
          }
        />
      </div>

      {/* Mobile Layout - unchanged */}
      <div className="flex-1 flex overflow-hidden md:hidden">
        {/* Left: Navigation Tree */}
        <div className={`w-full overflow-y-auto ${mobileView === 'nav' ? 'block' : 'hidden'}`}>
          <NavigationTree
            key={`mobile-${refreshKey}`}
            issue={issue}
            setIssue={setIssue}
            plotlines={issue.series.plotlines || []}
            selectedPageId={selectedPageId}
            onSelectPage={(pageId) => {
              setSelectedPageId(pageId)
              setMobileView('editor')
            }}
            onRefresh={refreshIssue}
          />
        </div>

        {/* Center: Page/Panel Editor */}
        <div className={`flex-1 overflow-hidden flex flex-col ${mobileView === 'editor' ? 'block' : 'hidden'}`}>
          {selectedPage ? (
            <>
              {/* Previous page context */}
              <PreviousPageContext
                previousPage={previousPageData?.page || null}
                sceneName={previousPageData?.sceneName}
              />
              {/* Current page editor */}
              <div className="flex-1 overflow-y-auto">
                <PageEditor
                  page={selectedPage}
                  pageContext={selectedPageContext}
                  characters={issue.series.characters}
                  locations={issue.series.locations}
                  scenePages={currentScenePages}
                  onUpdate={refreshIssue}
                  setSaveStatus={setSaveStatus}
                  filedNotes={filedNotes.filter(n => n.filed_to_page_id === selectedPage?.id)}
                />
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-[var(--text-muted)]">
              <div className="text-center p-8 max-w-md">
                <div className="text-5xl mb-4 opacity-30">📄</div>
                <h3 className="text-lg font-medium text-[var(--text-secondary)] mb-2">No pages yet</h3>
                <p className="text-sm text-[var(--text-muted)] mb-6">
                  Start by creating an act and scene in the navigation tree on the left.
                </p>
                <button
                  onClick={() => setMobileView('nav')}
                  className="mt-6 text-[var(--color-primary)] hover:text-[var(--color-primary-hover)] active:scale-[0.97] transition-all duration-150 ease-out"
                >
                  Go to Navigation →
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right: Toolkit */}
        <div className={`w-full overflow-y-auto ${mobileView === 'toolkit' ? 'block' : 'hidden'}`}>
          <Toolkit
            issue={issue}
            selectedPageContext={selectedPageContext}
            onRefresh={refreshIssue}
          />
        </div>
      </div>

      {/* Status Bar */}
      <StatusBar
        issue={issue}
        issueId={issue.id}
        selectedPageId={selectedPageId}
        saveStatus={saveStatus}
        writingPhase={issue.writing_phase}
        onPhaseChange={(phase) => {
          setIssue(prev => ({ ...prev, writing_phase: phase }))
        }}
      />

      {/* Find & Replace Modal */}
      <FindReplaceModal
        issue={issue}
        isOpen={isFindReplaceOpen}
        onClose={() => setIsFindReplaceOpen(false)}
        onNavigateToPanel={handleNavigateToPanel}
        onRefresh={refreshIssue}
      />

      {/* Keyboard Shortcuts Modal */}
      <KeyboardShortcutsModal
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
      />

      {/* Command Palette (Cmd+K) */}
      <CommandPalette seriesId={seriesId} issueId={issue.id} />

      {/* Jump to Page Modal */}
      <JumpToPageModal
        isOpen={isJumpToPageOpen}
        onClose={() => setIsJumpToPageOpen(false)}
        pages={(() => {
          const pages: { id: string; pageNumber: number; sceneName: string; actName: string }[] = []
          for (const act of issue.acts || []) {
            const actName = act.name || `Act ${act.sort_order + 1}`
            for (const scene of act.scenes || []) {
              const sceneName = scene.title || `Scene ${scene.sort_order + 1}`
              for (const page of scene.pages || []) {
                pages.push({
                  id: page.id,
                  pageNumber: page.page_number,
                  sceneName,
                  actName,
                })
              }
            }
          }
          return pages
        })()}
        onSelectPage={(pageId) => setSelectedPageId(pageId)}
        currentPageId={selectedPageId}
      />

      {/* Zoom Panel (Context Ladder) */}
      {isZoomPanelOpen && (
        <ZoomPanel
          seriesTitle={issue.series.title}
          seriesId={seriesId}
          issue={issue}
          selectedPageId={selectedPageId}
          onSelectPage={(pageId) => setSelectedPageId(pageId)}
          onClose={() => setIsZoomPanelOpen(false)}
        />
      )}

      {/* Zen Mode (Distraction-free writing) */}
      {isZenMode && selectedPage && (
        <ZenMode
          page={selectedPage}
          characters={issue.series.characters}
          pagePosition={`Page ${selectedPage.page_number} of ${allPages.length}`}
          sceneContext={selectedPageContext ? {
            actName: selectedPageContext.act.name || `Act ${selectedPageContext.act.sort_order + 1}`,
            sceneName: selectedPageContext.scene.name || 'Untitled Scene',
            plotlineName: selectedPageContext.scene.plotline_name,
            pagePositionInScene: selectedPageContext.pagePositionInScene,
            totalPagesInScene: selectedPageContext.scene.total_pages,
          } : null}
          onExit={() => setIsZenMode(false)}
          onSave={refreshIssue}
          onNavigate={(direction) => {
            navigateToPage(direction)
          }}
        />
      )}

      {/* Script View (Traditional script format editor) */}
      {isScriptView && (
        <ScriptView
          issue={issue}
          selectedPageId={selectedPageId}
          onExit={() => setIsScriptView(false)}
          onRefresh={refreshIssue}
          onNavigate={(pageId) => setSelectedPageId(pageId)}
        />
      )}

      {/* Quick Navigation Palette */}
      <QuickNav
        acts={issue.acts || []}
        currentSelection={{
          actId: selectedPageContext?.act?.id || null,
          sceneId: selectedPageContext?.scene?.id || null,
          pageId: selectedPageId,
          panelId: null,
        }}
        onNavigate={(type, id) => {
          if (type === 'page') {
            setSelectedPageId(id)
          } else if (type === 'panel') {
            // Find the page containing this panel and select it
            for (const act of issue.acts || []) {
              for (const scene of act.scenes || []) {
                for (const page of scene.pages || []) {
                  const panel = (page.panels || []).find((p: any) => p.id === id)
                  if (panel) {
                    setSelectedPageId(page.id)
                    // Trigger scroll to panel (via URL hash or event)
                    setTimeout(() => {
                      const panelElement = document.getElementById(`panel-${id}`)
                      panelElement?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                    }, 100)
                    return
                  }
                }
              }
            }
          } else if (type === 'scene') {
            // Select first page of the scene
            for (const act of issue.acts || []) {
              for (const scene of act.scenes || []) {
                if (scene.id === id && scene.pages?.[0]) {
                  setSelectedPageId(scene.pages[0].id)
                  return
                }
              }
            }
          } else if (type === 'act') {
            // Select first page of the act
            for (const act of issue.acts || []) {
              if (act.id === id && act.scenes?.[0]?.pages?.[0]) {
                setSelectedPageId(act.scenes[0].pages[0].id)
                return
              }
            }
          }
        }}
        isOpen={isQuickNavOpen}
        onClose={() => setIsQuickNavOpen(false)}
      />

      {/* Quick Page Peek — read-only preview of adjacent page */}
      {peekPageData && (
        <div className="fixed inset-0 z-50 flex" onClick={() => setPeekPageId(null)}>
          <div
            className="w-[420px] bg-[var(--bg-secondary)] shadow-xl overflow-y-auto border-r border-[var(--border)]"
            style={{ animation: 'page-enter 150ms ease-out' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4">
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-[var(--text-primary)]">Page {peekPageData.page_number}</h3>
                  <span className="text-xs text-[var(--text-muted)] font-mono">
                    ({peekPageData.page_number % 2 === 0 ? 'left' : 'right'}) — peek
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setSelectedPageId(peekPageId)
                      setPeekPageId(null)
                    }}
                    className="text-xs text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]"
                  >
                    Go to page
                  </button>
                  <button
                    onClick={() => setPeekPageId(null)}
                    className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-lg leading-none"
                  >
                    ×
                  </button>
                </div>
              </div>
              <div className="space-y-3">
                {[...(peekPageData.panels || [])].sort((a: any, b: any) => a.panel_number - b.panel_number).map((panel: any) => (
                  <div key={panel.id || panel.panel_number} className="bg-[var(--bg-tertiary)] rounded p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-semibold text-[var(--text-secondary)] bg-[var(--bg-secondary)] px-1.5 py-0.5 rounded">
                        Panel {panel.panel_number}
                      </span>
                      {panel.camera && (
                        <span className="text-[10px] text-[var(--text-muted)]">{panel.camera}</span>
                      )}
                    </div>
                    {panel.visual_description && (
                      <p className="text-xs text-[var(--text-secondary)] mb-2 leading-relaxed">{panel.visual_description}</p>
                    )}
                    {(panel.dialogue_blocks || []).length > 0 && (
                      <div className="space-y-1 border-l-2 border-[var(--color-primary)]/30 pl-2 mt-2">
                        {(panel.dialogue_blocks || []).map((d: any, i: number) => (
                          <div key={d.id || i} className="text-xs">
                            <span className="font-medium text-[var(--color-primary)]">
                              {d.character?.name || 'SPEAKER'}:
                            </span>{' '}
                            <span className="text-[var(--text-secondary)]">{d.text}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {(panel.captions || []).length > 0 && (
                      <div className="mt-2 space-y-1">
                        {(panel.captions || []).map((c: any, i: number) => (
                          <div key={c.id || i} className="text-xs italic text-[var(--text-muted)]">
                            CAP: {c.text}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {(!peekPageData.panels || peekPageData.panels.length === 0) && (
                  <p className="text-sm text-[var(--text-muted)] italic py-4 text-center">No panels on this page yet</p>
                )}
              </div>
            </div>
          </div>
          <div className="flex-1 bg-black/20" />
        </div>
      )}
    </div>
  )
}
