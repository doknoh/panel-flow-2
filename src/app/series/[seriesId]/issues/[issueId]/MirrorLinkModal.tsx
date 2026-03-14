'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/contexts/ToastContext'

interface MirrorLinkModalProps {
  pageId: string
  pageNumber: number
  currentMirrorId: string | null
  // availablePages should already be filtered by the caller to exclude:
  //   - the page itself (pageId)
  //   - pages that have linked_page_id IS NOT NULL (already spread partners)
  // The database trigger enforces mutual exclusion, but filtering here prevents
  // invalid selections from reaching the server.
  availablePages: { id: string; page_number: number }[]
  onDone: () => void
  onCancel: () => void
}

export default function MirrorLinkModal({
  pageId, pageNumber, currentMirrorId, availablePages, onDone, onCancel,
}: MirrorLinkModalProps) {
  const [selectedId, setSelectedId] = useState<string | null>(currentMirrorId)
  const [saving, setSaving] = useState(false)
  const { showToast } = useToast()

  const handleSave = async () => {
    setSaving(true)
    const supabase = createClient()

    // Clear old mirror link if changing
    if (currentMirrorId && currentMirrorId !== selectedId) {
      await supabase.from('pages').update({ mirror_page_id: null }).eq('id', pageId)
    }

    // Set new mirror link (trigger handles reciprocal)
    if (selectedId) {
      const { error } = await supabase.from('pages').update({ mirror_page_id: selectedId }).eq('id', pageId)
      if (error) {
        showToast(`Failed to link mirror: ${error.message}`, 'error')
        setSaving(false)
        return
      }
    } else {
      await supabase.from('pages').update({ mirror_page_id: null }).eq('id', pageId)
    }

    showToast(selectedId ? `Page ${pageNumber} mirrored` : 'Mirror link removed', 'success')
    setSaving(false)
    onDone()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onCancel}>
      <div className="modal-backdrop" />
      <div
        className="relative bg-[var(--bg-primary)] border border-[var(--border-strong)] shadow-xl p-6 w-80 z-10"
        style={{ animation: 'modal-dialog 200ms ease-out' }}
        onClick={e => e.stopPropagation()}
      >
        <h3 className="type-section mb-4">Link Mirror Page</h3>
        <p className="text-sm text-[var(--text-secondary)] mb-4">
          Select a page to mirror alongside Page {pageNumber}. Mirrored pages show
          panel-level alignment indicators.
        </p>
        <div className="space-y-1 max-h-48 overflow-y-auto mb-4">
          <button
            onClick={() => setSelectedId(null)}
            className={`w-full px-3 py-2 text-left text-sm rounded ${!selectedId ? 'bg-[var(--bg-tertiary)] font-medium' : 'hover:bg-[var(--bg-secondary)]'}`}
          >
            No mirror
          </button>
          {availablePages.map(p => (
            <button
              key={p.id}
              onClick={() => setSelectedId(p.id)}
              className={`w-full px-3 py-2 text-left text-sm rounded ${selectedId === p.id ? 'bg-[var(--bg-tertiary)] font-medium' : 'hover:bg-[var(--bg-secondary)]'}`}
            >
              Page {p.page_number}
            </button>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="hover-fade type-micro px-3 py-1.5 text-[var(--text-muted)]">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="hover-lift type-micro px-3 py-1.5 border border-[var(--border)] text-[var(--text-secondary)]"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
