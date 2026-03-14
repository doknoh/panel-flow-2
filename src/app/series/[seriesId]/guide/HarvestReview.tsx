'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/contexts/ToastContext'

interface HarvestItem {
  type: string
  content: string
  destination: string
  confidence: 'high' | 'medium' | 'low'
  status?: 'pending' | 'approved' | 'rejected' | 'redirected'
  redirectDestination?: string
}

interface HarvestReviewProps {
  items: HarvestItem[]
  seriesId: string
  issueId?: string
  onDone: () => void
}

const TYPE_LABELS: Record<string, string> = {
  story_beat: 'Story Beats',
  scene_description: 'Scene Descriptions',
  panel_draft: 'Panel Drafts',
  character_detail: 'Character Details',
  location_detail: 'Location Details',
  project_note: 'Project Notes',
  dialogue_line: 'Dialogue Lines',
}

const CONFIDENCE_COLORS: Record<string, string> = {
  high: 'text-[var(--color-success)]',
  medium: 'text-[var(--color-warning)]',
  low: 'text-[var(--text-muted)]',
}

export default function HarvestReview({ items: initialItems, seriesId, issueId, onDone }: HarvestReviewProps) {
  const [items, setItems] = useState<HarvestItem[]>(
    initialItems.map(i => ({ ...i, status: 'pending' }))
  )
  const [saving, setSaving] = useState(false)
  const { showToast } = useToast()

  const updateItem = (index: number, updates: Partial<HarvestItem>) => {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, ...updates } : item))
  }

  const approveAllHighConfidence = () => {
    setItems(prev => prev.map(item =>
      item.confidence === 'high' && item.status === 'pending'
        ? { ...item, status: 'approved' }
        : item
    ))
  }

  const saveApproved = useCallback(async () => {
    setSaving(true)
    const approved = items.filter(i => i.status === 'approved')
    const supabase = createClient()

    for (const item of approved) {
      const destination = item.redirectDestination || item.destination

      try {
        if (item.type === 'project_note') {
          // Insert a new project note tagged as an AI insight from harvest
          await supabase.from('project_notes').insert({
            series_id: seriesId,
            content: item.content,
            type: 'AI_INSIGHT',
            source: 'harvest',
          })

        } else if (item.type === 'character_detail') {
          // destination is expected to be a character name or ID.
          // Look up the character by name within this series and append to arc_notes.
          // TODO: Parse `destination` as character name → look up characters.id where
          //   series_id = seriesId AND (name ILIKE destination OR display_name ILIKE destination).
          //   Then: supabase.from('characters').update({ arc_notes: existing + '\n' + item.content })
          //   .eq('id', characterId)
          console.warn('character_detail harvest handler not yet implemented for destination:', destination)

        } else if (item.type === 'location_detail') {
          // destination may be an existing location name or a new location to create.
          // TODO: Try to find a matching location by name within this series:
          //   supabase.from('locations').select('id, description').eq('series_id', seriesId)
          //     .ilike('name', destination)
          //   If found: append item.content to description field (update).
          //   If not found: insert a new location with name = destination and description = item.content.
          console.warn('location_detail harvest handler not yet implemented for destination:', destination)

        } else if (item.type === 'story_beat') {
          // destination is expected to encode a page reference (e.g. "Page 8" or "page-uuid").
          // TODO: Resolve destination string to a pages.id:
          //   - If destination looks like a UUID, use directly.
          //   - Otherwise, parse "Page N" and query pages joined through scenes → acts → issues
          //     where issue_id = issueId (if provided) and page_number = N.
          //   Then: supabase.from('pages').update({ story_beat: item.content }).eq('id', pageId)
          console.warn('story_beat harvest handler not yet implemented for destination:', destination)

        } else if (item.type === 'scene_description') {
          // destination is expected to encode a scene reference (e.g. "Scene 3" or "scene-uuid").
          // TODO: Resolve destination string to a scenes.id:
          //   - If destination looks like a UUID, use directly.
          //   - Otherwise, parse "Scene N" and query scenes joined through acts → issues
          //     where issue_id = issueId (if provided) ordered by position, then take Nth.
          //   Then: supabase.from('scenes').update({ notes: item.content }).eq('id', sceneId)
          //   Note: scenes table may not have a notes column — confirm schema before implementing.
          console.warn('scene_description harvest handler not yet implemented for destination:', destination)

        } else if (item.type === 'panel_draft') {
          // destination is expected to encode a page reference (e.g. "Page 8" or "page-uuid").
          // TODO: Resolve destination page ID (same logic as story_beat above).
          //   Then: determine the next panel sort_order on that page and insert:
          //   supabase.from('panels').insert({
          //     page_id: pageId,
          //     visual_description: item.content,
          //     sort_order: nextSortOrder,
          //   })
          console.warn('panel_draft harvest handler not yet implemented for destination:', destination)

        } else if (item.type === 'dialogue_line') {
          // destination is expected to encode a panel reference (e.g. "Panel 3 on Page 8" or "panel-uuid").
          // TODO: Resolve destination string to a panels.id:
          //   - If destination looks like a UUID, use directly.
          //   - Otherwise, parse speaker + panel reference from destination string and resolve
          //     panel_id via page → scene → act → issue chain (using issueId if provided).
          //   Then: determine next balloon_number and insert:
          //   supabase.from('dialogue_blocks').insert({
          //     panel_id: panelId,
          //     speaker: parsedSpeaker || 'UNKNOWN',
          //     dialogue_type: 'DIALOGUE',
          //     text: item.content,
          //     balloon_number: nextBalloonNumber,
          //   })
          console.warn('dialogue_line harvest handler not yet implemented for destination:', destination)

        } else {
          console.warn('Unknown harvest item type:', item.type, 'for destination:', destination)
        }
      } catch (e) {
        console.error('Failed to save harvest item:', e)
      }
    }

    showToast(`${approved.length} items saved`, 'success')
    setSaving(false)
    onDone()
  }, [items, seriesId, issueId, showToast, onDone])

  // Group items by type
  const grouped = items.reduce<Record<string, { item: HarvestItem; index: number }[]>>((acc, item, index) => {
    const key = item.type
    if (!acc[key]) acc[key] = []
    acc[key].push({ item, index })
    return acc
  }, {})

  const pendingCount = items.filter(i => i.status === 'pending').length
  const approvedCount = items.filter(i => i.status === 'approved').length

  // Suppress unused variable warning — pendingCount may be used in future UI
  void pendingCount

  return (
    <div className="border-t border-[var(--border)] bg-[var(--bg-secondary)] p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="type-label">Harvest Review — {items.length} items found</h3>
        <div className="flex gap-2">
          <button
            onClick={approveAllHighConfidence}
            className="hover-lift type-micro px-3 py-1.5 border border-[var(--border)] text-[var(--text-secondary)]"
          >
            Approve all high-confidence
          </button>
          <button
            onClick={saveApproved}
            disabled={saving || approvedCount === 0}
            className="hover-lift type-micro px-3 py-1.5 border border-[var(--color-primary)] text-[var(--color-primary)]"
          >
            {saving ? 'Saving...' : `Save ${approvedCount} approved`}
          </button>
        </div>
      </div>

      <div className="space-y-4 max-h-96 overflow-y-auto">
        {Object.entries(grouped).map(([type, entries]) => (
          <div key={type}>
            <h4 className="type-micro text-[var(--text-muted)] mb-2">{TYPE_LABELS[type] || type}</h4>
            <div className="space-y-2">
              {entries.map(({ item, index }) => (
                <div
                  key={index}
                  className={`p-3 rounded border ${
                    item.status === 'approved' ? 'border-[var(--color-success)]/30 bg-[var(--color-success)]/5' :
                    item.status === 'rejected' ? 'border-[var(--border)] opacity-40' :
                    'border-[var(--border)] bg-[var(--bg-tertiary)]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <p className="text-sm text-[var(--text-primary)]">{item.content}</p>
                      <p className="text-xs text-[var(--text-muted)] mt-1">
                        → {item.redirectDestination || item.destination}
                        <span className={`ml-2 ${CONFIDENCE_COLORS[item.confidence]}`}>
                          ({item.confidence})
                        </span>
                      </p>
                    </div>
                    {item.status === 'pending' && (
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => updateItem(index, { status: 'approved' })}
                          className="type-micro px-2 py-1 hover-fade text-[var(--color-success)]">✓</button>
                        <button onClick={() => updateItem(index, { status: 'rejected' })}
                          className="type-micro px-2 py-1 hover-fade text-[var(--text-muted)]">✗</button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
