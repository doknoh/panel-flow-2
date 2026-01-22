'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/contexts/ToastContext'
import { useRouter } from 'next/navigation'

interface Snapshot {
  id: string
  issue_id: string
  snapshot_data: {
    pages?: Array<{
      id: string
      page_number: number
      panels?: Array<{
        id: string
        panel_number: number
        visual_description?: string
        dialogue_blocks?: Array<{ text: string }>
        captions?: Array<{ text: string }>
        sound_effects?: Array<{ text: string }>
      }>
    }>
  }
  created_at: string
  description: string | null
}

interface VersionHistoryClientProps {
  issueId: string
  seriesId: string
  initialSnapshots: Snapshot[]
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function getSnapshotSummary(snapshot: Snapshot): string {
  const pages = snapshot.snapshot_data?.pages || []
  const panelCount = pages.reduce((acc, p) => acc + (p.panels?.length || 0), 0)
  return `${pages.length} page${pages.length !== 1 ? 's' : ''}, ${panelCount} panel${panelCount !== 1 ? 's' : ''}`
}

function findDifferences(older: Snapshot | null, newer: Snapshot): string[] {
  if (!older) return ['Initial version']

  const diffs: string[] = []
  const oldPages = older.snapshot_data?.pages || []
  const newPages = newer.snapshot_data?.pages || []

  // Compare page counts
  if (newPages.length > oldPages.length) {
    diffs.push(`Added ${newPages.length - oldPages.length} page(s)`)
  } else if (newPages.length < oldPages.length) {
    diffs.push(`Removed ${oldPages.length - newPages.length} page(s)`)
  }

  // Compare panels per page
  newPages.forEach((newPage, idx) => {
    const oldPage = oldPages[idx]
    if (!oldPage) return

    const oldPanels = oldPage.panels || []
    const newPanels = newPage.panels || []

    if (newPanels.length > oldPanels.length) {
      diffs.push(`Page ${newPage.page_number}: added ${newPanels.length - oldPanels.length} panel(s)`)
    } else if (newPanels.length < oldPanels.length) {
      diffs.push(`Page ${newPage.page_number}: removed ${oldPanels.length - newPanels.length} panel(s)`)
    }

    // Check for content changes
    newPanels.forEach((newPanel, pIdx) => {
      const oldPanel = oldPanels[pIdx]
      if (!oldPanel) return

      if (newPanel.visual_description !== oldPanel.visual_description) {
        diffs.push(`Page ${newPage.page_number}, Panel ${newPanel.panel_number}: visual description changed`)
      }

      const oldDialogueCount = oldPanel.dialogue_blocks?.length || 0
      const newDialogueCount = newPanel.dialogue_blocks?.length || 0
      if (newDialogueCount !== oldDialogueCount) {
        diffs.push(`Page ${newPage.page_number}, Panel ${newPanel.panel_number}: dialogue count changed`)
      }
    })
  })

  return diffs.length > 0 ? diffs : ['No significant changes detected']
}

export default function VersionHistoryClient({
  issueId,
  seriesId,
  initialSnapshots,
}: VersionHistoryClientProps) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>(initialSnapshots)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [isRestoring, setIsRestoring] = useState(false)
  const { showToast } = useToast()
  const router = useRouter()

  const selectedSnapshot = selectedIndex !== null ? snapshots[selectedIndex] : null
  const previousSnapshot = selectedIndex !== null && selectedIndex < snapshots.length - 1
    ? snapshots[selectedIndex + 1]
    : null

  const handleRestore = async (snapshot: Snapshot) => {
    if (!confirm('Are you sure you want to restore this version? This will overwrite current content.')) {
      return
    }

    setIsRestoring(true)
    const supabase = createClient()

    try {
      // First, save current state as a snapshot before restoring
      const { data: currentPages } = await supabase
        .from('pages')
        .select(`
          id,
          page_number,
          panels (
            id,
            panel_number,
            visual_description,
            shot_type,
            notes,
            dialogue_blocks (id, character_id, dialogue_type, text, sort_order),
            captions (id, caption_type, text, sort_order),
            sound_effects (id, text, sort_order)
          )
        `)
        .eq('issue_id', issueId)
        .order('page_number')

      // Save current as "Before restore" snapshot
      await supabase.from('version_snapshots').insert({
        issue_id: issueId,
        snapshot_data: { pages: currentPages || [] },
        description: 'Auto-save before restore',
      })

      // Delete all current pages (cascade will delete panels, etc.)
      await supabase.from('pages').delete().eq('issue_id', issueId)

      // Recreate pages from snapshot
      const pages = snapshot.snapshot_data?.pages || []
      for (const page of pages) {
        const { data: newPage } = await supabase
          .from('pages')
          .insert({
            issue_id: issueId,
            page_number: page.page_number,
            sort_order: page.page_number,
          })
          .select()
          .single()

        if (!newPage) continue

        // Recreate panels
        for (const panel of page.panels || []) {
          const { data: newPanel } = await supabase
            .from('panels')
            .insert({
              page_id: newPage.id,
              panel_number: panel.panel_number,
              visual_description: panel.visual_description || '',
              sort_order: panel.panel_number,
            })
            .select()
            .single()

          if (!newPanel) continue

          // Recreate dialogue blocks
          for (const db of panel.dialogue_blocks || []) {
            await supabase.from('dialogue_blocks').insert({
              panel_id: newPanel.id,
              dialogue_type: 'dialogue',
              text: db.text,
              sort_order: 1,
            })
          }

          // Recreate captions
          for (const cap of panel.captions || []) {
            await supabase.from('captions').insert({
              panel_id: newPanel.id,
              caption_type: 'narrative',
              text: cap.text,
              sort_order: 1,
            })
          }

          // Recreate sound effects
          for (const sfx of panel.sound_effects || []) {
            await supabase.from('sound_effects').insert({
              panel_id: newPanel.id,
              text: sfx.text,
              sort_order: 1,
            })
          }
        }
      }

      showToast('Version restored successfully', 'success')
      router.push(`/series/${seriesId}/issues/${issueId}`)
    } catch (error) {
      console.error('Error restoring version:', error)
      showToast('Failed to restore version', 'error')
    } finally {
      setIsRestoring(false)
    }
  }

  if (snapshots.length === 0) {
    return (
      <div className="text-center py-16 bg-zinc-900 border border-zinc-800 rounded-lg">
        <p className="text-zinc-400 mb-2">No version history available</p>
        <p className="text-zinc-500 text-sm">
          Versions are automatically saved as you work.
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Version List */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold mb-4">Saved Versions</h2>
        {snapshots.map((snapshot, index) => {
          const diffs = findDifferences(
            index < snapshots.length - 1 ? snapshots[index + 1] : null,
            snapshot
          )

          return (
            <button
              key={snapshot.id}
              onClick={() => setSelectedIndex(index)}
              className={`w-full text-left p-4 rounded-lg border transition-colors ${
                selectedIndex === index
                  ? 'bg-blue-900/30 border-blue-500'
                  : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-medium">{formatDate(snapshot.created_at)}</p>
                  <p className="text-sm text-zinc-400">{getSnapshotSummary(snapshot)}</p>
                </div>
                {index === 0 && (
                  <span className="text-xs bg-green-900 text-green-300 px-2 py-0.5 rounded">
                    Current
                  </span>
                )}
              </div>
              {snapshot.description && (
                <p className="text-sm text-zinc-400 mb-2 italic">{snapshot.description}</p>
              )}
              <div className="mt-2">
                {diffs.slice(0, 3).map((diff, i) => (
                  <p key={i} className="text-xs text-zinc-500">
                    <span className="text-yellow-500 mr-1">&bull;</span>
                    {diff}
                  </p>
                ))}
                {diffs.length > 3 && (
                  <p className="text-xs text-zinc-600">+{diffs.length - 3} more changes</p>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {/* Version Preview */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Preview</h2>
        {selectedSnapshot ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="font-medium">{formatDate(selectedSnapshot.created_at)}</p>
                <p className="text-sm text-zinc-400">{getSnapshotSummary(selectedSnapshot)}</p>
              </div>
              {selectedIndex !== 0 && (
                <button
                  onClick={() => handleRestore(selectedSnapshot)}
                  disabled={isRestoring}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 px-4 py-2 rounded font-medium text-sm"
                >
                  {isRestoring ? 'Restoring...' : 'Restore This Version'}
                </button>
              )}
            </div>

            {/* Changes from previous version */}
            <div className="mb-6">
              <h3 className="text-sm font-medium text-zinc-400 mb-2">Changes from previous version:</h3>
              <div className="bg-zinc-800 rounded p-3">
                {findDifferences(previousSnapshot, selectedSnapshot).map((diff, i) => (
                  <p key={i} className="text-sm">
                    <span className={diff.includes('added') || diff.includes('Added') ? 'text-green-400' : diff.includes('removed') || diff.includes('Removed') ? 'text-red-400' : 'text-yellow-400'}>
                      {diff.includes('added') || diff.includes('Added') ? '+' : diff.includes('removed') || diff.includes('Removed') ? '-' : '~'}
                    </span>{' '}
                    {diff}
                  </p>
                ))}
              </div>
            </div>

            {/* Content Preview */}
            <div>
              <h3 className="text-sm font-medium text-zinc-400 mb-2">Content:</h3>
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {(selectedSnapshot.snapshot_data?.pages || []).map((page) => (
                  <div key={page.id} className="bg-zinc-800 rounded p-3">
                    <p className="font-medium text-sm mb-2">Page {page.page_number}</p>
                    <div className="space-y-2">
                      {(page.panels || []).map((panel) => (
                        <div key={panel.id} className="text-sm text-zinc-400 pl-3 border-l border-zinc-700">
                          <p className="text-zinc-500">Panel {panel.panel_number}</p>
                          {panel.visual_description && (
                            <p className="text-xs line-clamp-2">{panel.visual_description}</p>
                          )}
                          {(panel.dialogue_blocks?.length || 0) > 0 && (
                            <p className="text-xs text-zinc-500">
                              {panel.dialogue_blocks?.length} dialogue block(s)
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 text-center text-zinc-400">
            Select a version to preview
          </div>
        )}
      </div>
    </div>
  )
}
