'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import NavigationTree from './NavigationTree'
import PageEditor from './PageEditor'
import Toolkit from './Toolkit'
import { exportIssueToPdf } from '@/lib/exportPdf'
import { useToast } from '@/contexts/ToastContext'

interface Issue {
  id: string
  number: number
  title: string | null
  summary: string | null
  themes: string | null
  status: string
  series: {
    id: string
    title: string
    characters: any[]
    locations: any[]
  }
  acts: any[]
}

export default function IssueEditor({ issue: initialIssue, seriesId }: { issue: Issue; seriesId: string }) {
  const [issue, setIssue] = useState(initialIssue)
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved')
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
          locations (*)
        ),
        acts (
          *,
          scenes (
            *,
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

  return (
    <div className="h-screen flex flex-col bg-zinc-950 text-white">
      {/* Header */}
      <header className="border-b border-zinc-800 px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Link href={`/series/${seriesId}`} className="text-zinc-400 hover:text-white">
            ← {issue.series.title}
          </Link>
          <span className="text-zinc-600">/</span>
          <span className="font-semibold">Issue #{issue.number}</span>
          {issue.title && <span className="text-zinc-400">— {issue.title}</span>}
        </div>
        <div className="flex items-center gap-4">
          <Link
            href={`/series/${seriesId}/issues/${issue.id}/history`}
            className="text-sm text-zinc-400 hover:text-white"
          >
            History
          </Link>
          <button
            onClick={() => exportIssueToPdf(issue)}
            className="text-sm bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded"
          >
            Export PDF
          </button>
          <span className={`text-sm ${
            saveStatus === 'saved' ? 'text-green-500' :
            saveStatus === 'saving' ? 'text-yellow-500' :
            'text-red-500'
          }`}>
            {saveStatus === 'saved' ? '✓ Saved' :
             saveStatus === 'saving' ? 'Saving...' :
             'Unsaved'}
          </span>
        </div>
      </header>

      {/* Main Three-Column Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Navigation Tree */}
        <div className="w-64 border-r border-zinc-800 overflow-y-auto shrink-0">
          <NavigationTree
            issue={issue}
            selectedPageId={selectedPageId}
            onSelectPage={setSelectedPageId}
            onRefresh={refreshIssue}
          />
        </div>

        {/* Center: Page/Panel Editor */}
        <div className="flex-1 overflow-y-auto">
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
              <div className="text-center">
                <p className="mb-4">No pages yet</p>
                <p className="text-sm">Create an act and scene in the navigation tree to get started</p>
              </div>
            </div>
          )}
        </div>

        {/* Right: Toolkit */}
        <div className="w-80 border-l border-zinc-800 overflow-y-auto shrink-0">
          <Toolkit issue={issue} />
        </div>
      </div>
    </div>
  )
}
