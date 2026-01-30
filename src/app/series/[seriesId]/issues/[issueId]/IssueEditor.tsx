'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import NavigationTree from './NavigationTree'
import PageEditor from './PageEditor'
import Toolkit from './Toolkit'
import FindReplaceModal from './FindReplaceModal'
import KeyboardShortcutsModal from './KeyboardShortcutsModal'
import StatusBar from './StatusBar'
import ResizablePanels from '@/components/ResizablePanels'
import { exportIssueToPdf } from '@/lib/exportPdf'
import { exportIssueToDocx } from '@/lib/exportDocx'
import { exportIssueToTxt } from '@/lib/exportTxt'
import { useToast } from '@/contexts/ToastContext'
import { UndoProvider, useUndo } from '@/contexts/UndoContext'
import ThemeToggle from '@/components/ui/ThemeToggle'

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

export default function IssueEditor({ issue: initialIssue, seriesId }: { issue: Issue; seriesId: string }) {
  const [issue, setIssue] = useState(initialIssue)
  const [refreshKey, setRefreshKey] = useState(0)
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved')
  const [isFindReplaceOpen, setIsFindReplaceOpen] = useState(false)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editedTitle, setEditedTitle] = useState(issue.title || '')
  const titleInputRef = useRef<HTMLInputElement>(null)
  const { showToast } = useToast()
  const lastSnapshotRef = useRef<string>('')
  const snapshotTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Find the selected page data along with its Act/Scene context
  const selectedPageContext = (() => {
    if (!selectedPageId) return null
    for (const act of (issue.acts || [])) {
      for (const scene of (act.scenes || [])) {
        const page = (scene.pages || []).find((p: any) => p.id === selectedPageId)
        if (page) {
          return {
            page,
            act: { id: act.id, name: act.name, sort_order: act.sort_order },
            scene: { id: scene.id, name: scene.name, sort_order: scene.sort_order }
          }
        }
      }
    }
    return null
  })()

  const selectedPage = selectedPageContext?.page

  // Auto-select first page if none selected
  useEffect(() => {
    if (!selectedPageId) {
      const firstPage = issue.acts?.[0]?.scenes?.[0]?.pages?.[0]
      if (firstPage) {
        setSelectedPageId(firstPage.id)
      }
    }
  }, [issue, selectedPageId])

  // Refresh data on mount to ensure latest characters/locations are loaded
  useEffect(() => {
    refreshIssue()
  }, [])

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
    console.log('refreshIssue: STARTING refresh for issue', initialIssue.id)
    const supabase = createClient()

    // Add a small delay to ensure DB transaction is committed
    await new Promise(resolve => setTimeout(resolve, 150))

    // Fetch issue data and plotlines separately to avoid PostgREST relationship issues
    const [issueResult, plotlinesResult] = await Promise.all([
      supabase
        .from('issues')
        .select(`
          *,
          series:series_id (
            id,
            title,
            characters (*),
            locations (*)
          ),
          acts (
            *,
            scenes (
              *,
              plotline:plotline_id (*),
              pages (
                *,
                panels (
                  *,
                  dialogue_blocks (*),
                  captions (*),
                  sound_effects (*)
                )
              )
            )
          )
        `)
        .eq('id', initialIssue.id)
        .single(),
      supabase
        .from('plotlines')
        .select('*')
        .eq('series_id', initialIssue.series_id)
        .order('sort_order')
    ])

    const { data, error } = issueResult

    // Merge plotlines into series data if both succeeded
    if (data && plotlinesResult.data) {
      data.series.plotlines = plotlinesResult.data
    }

    if (error) {
      console.error('refreshIssue: FAILED to refresh issue:', error.message, '| code:', error.code, '| details:', error.details, '| hint:', error.hint)
      return
    }

    if (data) {
      console.log('refreshIssue: GOT DATA, acts count:', data.acts?.length, 'scenes:', data.acts?.flatMap((a: any) => a.scenes || []).length)
      // Sort acts, scenes, and pages by sort_order for consistent display
      const sortedData = {
        ...data,
        // Add a timestamp to force React to see this as new data
        _refreshedAt: Date.now(),
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
      console.log('refreshIssue: SETTING new issue data')
      setIssue(sortedData)
      setRefreshKey(k => k + 1)
      console.log('refreshIssue: DONE, refreshKey incremented')
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
        saveStatus={saveStatus}
        setSaveStatus={setSaveStatus}
        isFindReplaceOpen={isFindReplaceOpen}
        setIsFindReplaceOpen={setIsFindReplaceOpen}
        refreshIssue={refreshIssue}
        handleNavigateToPanel={handleNavigateToPanel}
        showToast={showToast}
        isEditingTitle={isEditingTitle}
        setIsEditingTitle={setIsEditingTitle}
        editedTitle={editedTitle}
        setEditedTitle={setEditedTitle}
        titleInputRef={titleInputRef}
        saveTitle={saveTitle}
      />
    </UndoProvider>
  )
}

// Inner component that can use the useUndo hook
type MobileView = 'nav' | 'editor' | 'toolkit'

interface PageContext {
  page: any
  act: { id: string; name: string; sort_order: number }
  scene: { id: string; name: string; sort_order: number }
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
  saveStatus,
  setSaveStatus,
  isFindReplaceOpen,
  setIsFindReplaceOpen,
  refreshIssue,
  handleNavigateToPanel,
  showToast,
  isEditingTitle,
  setIsEditingTitle,
  editedTitle,
  setEditedTitle,
  titleInputRef,
  saveTitle,
}: {
  issue: Issue
  setIssue: React.Dispatch<React.SetStateAction<Issue>>
  seriesId: string
  refreshKey: number
  selectedPageId: string | null
  setSelectedPageId: (id: string | null) => void
  selectedPage: any
  selectedPageContext: PageContext | null
  saveStatus: 'saved' | 'saving' | 'unsaved'
  setSaveStatus: (status: 'saved' | 'saving' | 'unsaved') => void
  isFindReplaceOpen: boolean
  setIsFindReplaceOpen: (open: boolean) => void
  refreshIssue: () => void
  handleNavigateToPanel: (pageId: string, panelId: string) => void
  showToast: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void
  isEditingTitle: boolean
  setIsEditingTitle: (editing: boolean) => void
  editedTitle: string
  setEditedTitle: (title: string) => void
  titleInputRef: React.RefObject<HTMLInputElement | null>
  saveTitle: () => Promise<void>
}) {
  const { undo, redo, canUndo, canRedo } = useUndo()
  const [mobileView, setMobileView] = useState<MobileView>('editor')
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false)

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

      // Cmd/Ctrl + Shift + Z for Redo
      if (isMod && e.key === 'z' && e.shiftKey) {
        e.preventDefault()
        if (canRedo) {
          redo()
        }
        return
      }

      // Cmd/Ctrl + F for Find & Replace
      if (isMod && e.key === 'f') {
        e.preventDefault()
        setIsFindReplaceOpen(true)
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
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [canUndo, canRedo, undo, redo, saveStatus, showToast, setIsFindReplaceOpen, setIsShortcutsOpen])

  return (
    <div className="h-screen flex flex-col bg-[var(--bg-primary)] text-[var(--text-primary)]">
      {/* Header */}
      <header className="border-b border-[var(--border)] px-4 py-3 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <Link href={`/series/${seriesId}`} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] shrink-0">
              ←
            </Link>
            <span className="font-semibold shrink-0">Issue #{issue.number}</span>
            <span className="text-[var(--text-secondary)] hidden sm:inline shrink-0">—</span>
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
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] hidden sm:inline truncate max-w-[300px] text-left group"
                title="Click to edit title"
              >
                {issue.title || <span className="italic text-[var(--text-muted)]">Add title...</span>}
                <svg className="w-3 h-3 inline ml-1 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 md:gap-4">
            <button
              onClick={() => setIsShortcutsOpen(true)}
              className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hidden md:flex items-center gap-1"
              title="Keyboard shortcuts (?)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2" ry="2"></rect>
                <path d="M6 8h.001"></path>
                <path d="M10 8h.001"></path>
                <path d="M14 8h.001"></path>
                <path d="M18 8h.001"></path>
                <path d="M8 12h.001"></path>
                <path d="M12 12h.001"></path>
                <path d="M16 12h.001"></path>
                <path d="M7 16h10"></path>
              </svg>
            </button>
            <button
              onClick={() => setIsFindReplaceOpen(true)}
              className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hidden md:block"
              title="Find & Replace (⌘F)"
            >
              Find
            </button>
            <Link
              href={`/series/${seriesId}/issues/${issue.id}/import`}
              className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hidden lg:block"
            >
              Import
            </Link>
            <Link
              href={`/series/${seriesId}/issues/${issue.id}/weave`}
              className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hidden lg:block"
            >
              Weave
            </Link>
            <Link
              href={`/series/${seriesId}/guide?issue=${issue.id}`}
              className="text-sm text-purple-400 hover:text-purple-300 hidden lg:block"
            >
              Guide
            </Link>
            <Link
              href={`/series/${seriesId}/issues/${issue.id}/history`}
              className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hidden lg:block"
            >
              History
            </Link>
            <div className="flex items-center gap-1 md:gap-2">
              <button
                onClick={async () => {
                  try {
                    exportIssueToPdf(issue)
                    showToast('PDF exported successfully', 'success')
                  } catch (error) {
                    showToast('Failed to export PDF', 'error')
                    console.error('PDF export error:', error)
                  }
                }}
                className="text-xs md:text-sm bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] px-2 md:px-3 py-1.5 rounded"
              >
                PDF
              </button>
              <button
                onClick={async () => {
                  try {
                    await exportIssueToDocx(issue)
                    showToast('Doc exported successfully', 'success')
                  } catch (error) {
                    showToast('Failed to export Doc', 'error')
                    console.error('Doc export error:', error)
                  }
                }}
                className="text-xs md:text-sm bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] px-2 md:px-3 py-1.5 rounded hidden sm:block"
              >
                Doc
              </button>
              <button
                onClick={() => {
                  try {
                    exportIssueToTxt(issue)
                    showToast('TXT exported successfully', 'success')
                  } catch (error) {
                    showToast('Failed to export TXT', 'error')
                    console.error('TXT export error:', error)
                  }
                }}
                className="text-xs md:text-sm bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] px-2 md:px-3 py-1.5 rounded hidden sm:block"
              >
                TXT
              </button>
            </div>
            <ThemeToggle />
          </div>
        </div>

        {/* Mobile view switcher */}
        <div className="flex md:hidden mt-3 gap-1 border-t border-[var(--border)] pt-3 -mx-4 px-4">
          <button
            onClick={() => setMobileView('nav')}
            className={`flex-1 py-2 text-sm rounded ${mobileView === 'nav' ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}
          >
            Navigation
          </button>
          <button
            onClick={() => setMobileView('editor')}
            className={`flex-1 py-2 text-sm rounded ${mobileView === 'editor' ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}
          >
            Editor
          </button>
          <button
            onClick={() => setMobileView('toolkit')}
            className={`flex-1 py-2 text-sm rounded ${mobileView === 'toolkit' ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}
          >
            Toolkit
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
              <PageEditor
                page={selectedPage}
                pageContext={selectedPageContext}
                characters={issue.series.characters}
                locations={issue.series.locations}
                onUpdate={refreshIssue}
                setSaveStatus={setSaveStatus}
              />
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
        <div className={`flex-1 overflow-y-auto ${mobileView === 'editor' ? 'block' : 'hidden'}`}>
          {selectedPage ? (
            <PageEditor
              page={selectedPage}
              pageContext={selectedPageContext}
              characters={issue.series.characters}
              locations={issue.series.locations}
              onUpdate={refreshIssue}
              setSaveStatus={setSaveStatus}
            />
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
                  className="mt-6 text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]"
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
        selectedPageId={selectedPageId}
        saveStatus={saveStatus}
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
    </div>
  )
}
