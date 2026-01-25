'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import NavigationTree from './NavigationTree'
import PageEditor from './PageEditor'
import Toolkit from './Toolkit'
import FindReplaceModal from './FindReplaceModal'
import StatusBar from './StatusBar'
import { exportIssueToPdf } from '@/lib/exportPdf'
import { exportIssueToDocx } from '@/lib/exportDocx'
import { exportIssueToTxt } from '@/lib/exportTxt'
import { useToast } from '@/contexts/ToastContext'
import { UndoProvider, useUndo } from '@/contexts/UndoContext'

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
  series: {
    id: string
    title: string
    characters: any[]
    locations: any[]
    plotlines: Plotline[]
  }
  acts: any[]
}

export default function IssueEditor({ issue: initialIssue, seriesId }: { issue: Issue; seriesId: string }) {
  const [issue, setIssue] = useState(initialIssue)
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved')
  const [isFindReplaceOpen, setIsFindReplaceOpen] = useState(false)
  const { showToast } = useToast()
  const lastSnapshotRef = useRef<string>('')
  const snapshotTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Find the selected page data
  const selectedPage = issue.acts
    ?.flatMap(act => act.scenes || [])
    ?.flatMap(scene => scene.pages || [])
    ?.find(page => page.id === selectedPageId)

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

  const refreshIssue = async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('issues')
      .select(`
        *,
        series:series_id (
          id,
          title,
          characters (*),
          locations (*),
          plotlines (*)
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
      .eq('id', issue.id)
      .single()

    if (data) {
      setIssue(data)
    }
  }

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
        seriesId={seriesId}
        selectedPageId={selectedPageId}
        setSelectedPageId={setSelectedPageId}
        selectedPage={selectedPage}
        saveStatus={saveStatus}
        setSaveStatus={setSaveStatus}
        isFindReplaceOpen={isFindReplaceOpen}
        setIsFindReplaceOpen={setIsFindReplaceOpen}
        refreshIssue={refreshIssue}
        handleNavigateToPanel={handleNavigateToPanel}
        showToast={showToast}
      />
    </UndoProvider>
  )
}

// Inner component that can use the useUndo hook
type MobileView = 'nav' | 'editor' | 'toolkit'

function IssueEditorContent({
  issue,
  seriesId,
  selectedPageId,
  setSelectedPageId,
  selectedPage,
  saveStatus,
  setSaveStatus,
  isFindReplaceOpen,
  setIsFindReplaceOpen,
  refreshIssue,
  handleNavigateToPanel,
  showToast,
}: {
  issue: Issue
  seriesId: string
  selectedPageId: string | null
  setSelectedPageId: (id: string | null) => void
  selectedPage: any
  saveStatus: 'saved' | 'saving' | 'unsaved'
  setSaveStatus: (status: 'saved' | 'saving' | 'unsaved') => void
  isFindReplaceOpen: boolean
  setIsFindReplaceOpen: (open: boolean) => void
  refreshIssue: () => void
  handleNavigateToPanel: (pageId: string, panelId: string) => void
  showToast: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void
}) {
  const { undo, redo, canUndo, canRedo } = useUndo()
  const [mobileView, setMobileView] = useState<MobileView>('editor')

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
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [canUndo, canRedo, undo, redo, saveStatus, showToast, setIsFindReplaceOpen])

  return (
    <div className="h-screen flex flex-col bg-zinc-950 text-white">
      {/* Header */}
      <header className="border-b border-zinc-800 px-4 py-3 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <Link href={`/series/${seriesId}`} className="text-zinc-400 hover:text-white shrink-0">
              ←
            </Link>
            <span className="font-semibold truncate">Issue #{issue.number}</span>
            {issue.title && <span className="text-zinc-400 hidden sm:inline truncate">— {issue.title}</span>}
          </div>
          <div className="flex items-center gap-2 md:gap-4">
            <button
              onClick={() => setIsFindReplaceOpen(true)}
              className="text-sm text-zinc-400 hover:text-white hidden md:block"
              title="Find & Replace (⌘F)"
            >
              Find
            </button>
            <Link
              href={`/series/${seriesId}/issues/${issue.id}/import`}
              className="text-sm text-zinc-400 hover:text-white hidden lg:block"
            >
              Import
            </Link>
            <Link
              href={`/series/${seriesId}/issues/${issue.id}/weave`}
              className="text-sm text-zinc-400 hover:text-white hidden lg:block"
            >
              Weave
            </Link>
            <Link
              href={`/series/${seriesId}/issues/${issue.id}/history`}
              className="text-sm text-zinc-400 hover:text-white hidden lg:block"
            >
              History
            </Link>
            <div className="flex items-center gap-1 md:gap-2">
              <button
                onClick={() => exportIssueToPdf(issue)}
                className="text-xs md:text-sm bg-zinc-800 hover:bg-zinc-700 px-2 md:px-3 py-1.5 rounded"
              >
                PDF
              </button>
              <button
                onClick={() => exportIssueToDocx(issue)}
                className="text-xs md:text-sm bg-zinc-800 hover:bg-zinc-700 px-2 md:px-3 py-1.5 rounded hidden sm:block"
              >
                Doc
              </button>
              <button
                onClick={() => exportIssueToTxt(issue)}
                className="text-xs md:text-sm bg-zinc-800 hover:bg-zinc-700 px-2 md:px-3 py-1.5 rounded hidden sm:block"
              >
                TXT
              </button>
            </div>
          </div>
        </div>

        {/* Mobile view switcher */}
        <div className="flex md:hidden mt-3 gap-1 border-t border-zinc-800 pt-3 -mx-4 px-4">
          <button
            onClick={() => setMobileView('nav')}
            className={`flex-1 py-2 text-sm rounded ${mobileView === 'nav' ? 'bg-zinc-700 text-white' : 'text-zinc-400'}`}
          >
            Navigation
          </button>
          <button
            onClick={() => setMobileView('editor')}
            className={`flex-1 py-2 text-sm rounded ${mobileView === 'editor' ? 'bg-zinc-700 text-white' : 'text-zinc-400'}`}
          >
            Editor
          </button>
          <button
            onClick={() => setMobileView('toolkit')}
            className={`flex-1 py-2 text-sm rounded ${mobileView === 'toolkit' ? 'bg-zinc-700 text-white' : 'text-zinc-400'}`}
          >
            Toolkit
          </button>
        </div>
      </header>

      {/* Main Three-Column Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Navigation Tree */}
        <div className={`w-full md:w-64 border-r border-zinc-800 overflow-y-auto shrink-0 ${mobileView === 'nav' ? 'block' : 'hidden md:block'}`}>
          <NavigationTree
            issue={issue}
            plotlines={issue.series.plotlines || []}
            selectedPageId={selectedPageId}
            onSelectPage={(pageId) => {
              setSelectedPageId(pageId)
              setMobileView('editor') // Switch to editor on mobile after selecting
            }}
            onRefresh={refreshIssue}
          />
        </div>

        {/* Center: Page/Panel Editor */}
        <div className={`flex-1 overflow-y-auto ${mobileView === 'editor' ? 'block' : 'hidden md:block'}`}>
          {selectedPage ? (
            <PageEditor
              page={selectedPage}
              characters={issue.series.characters}
              locations={issue.series.locations}
              onUpdate={refreshIssue}
              setSaveStatus={setSaveStatus}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-zinc-500">
              <div className="text-center p-4">
                <p className="mb-4">No pages yet</p>
                <p className="text-sm">Create an act and scene in the navigation tree to get started</p>
                <button
                  onClick={() => setMobileView('nav')}
                  className="md:hidden mt-4 text-blue-400 hover:text-blue-300"
                >
                  Go to Navigation →
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right: Toolkit */}
        <div className={`w-full md:w-80 border-l border-zinc-800 overflow-y-auto shrink-0 ${mobileView === 'toolkit' ? 'block' : 'hidden md:block'}`}>
          <Toolkit issue={issue} />
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
    </div>
  )
}
