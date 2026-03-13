'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useFocusTrap } from '@/hooks/useFocusTrap'

export type ExportFormat = 'pdf' | 'docx' | 'txt'

export interface ExportOptions {
  format: ExportFormat
  includeSummary: boolean
  includeNotes: boolean
}

interface ExportModalProps {
  open: boolean
  onExport: (options: ExportOptions) => void
  onCancel: () => void
}

export default function ExportModal({ open, onExport, onCancel }: ExportModalProps) {
  const [format, setFormat] = useState<ExportFormat>('pdf')
  const [includeSummary, setIncludeSummary] = useState(true)
  const [includeNotes, setIncludeNotes] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const focusTrapRef = useFocusTrap(open)

  useEffect(() => {
    if (open) {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onCancel()
      }
      document.addEventListener('keydown', handleKeyDown)
      return () => document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, onCancel])

  const handleExport = useCallback(() => {
    onExport({ format, includeSummary, includeNotes })
  }, [format, includeSummary, includeNotes, onExport])

  if (!open) return null

  return (
    <div ref={focusTrapRef} className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />

      {/* Dialog */}
      <div
        ref={dialogRef}
        className="relative bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg shadow-xl w-full max-w-sm mx-4 p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-modal-title"
      >
        <h3 id="export-modal-title" className="type-label mb-6">EXPORT SCRIPT</h3>

        {/* Format selection */}
        <div className="mb-5">
          <label className="type-micro text-[var(--text-muted)] block mb-2">FORMAT</label>
          <div className="flex gap-2">
            {(['pdf', 'docx', 'txt'] as ExportFormat[]).map((f) => (
              <button
                key={f}
                onClick={() => setFormat(f)}
                className={`flex-1 py-2 px-3 type-meta border rounded hover-glow ${
                  format === f
                    ? 'border-[var(--color-primary)] text-[var(--color-primary)] bg-[var(--color-primary)]/10'
                    : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-strong)]'
                }`}
              >
                {f === 'docx' ? 'WORD' : f.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Options */}
        <div className="space-y-3 mb-6">
          <label className="flex items-center gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={includeSummary}
              onChange={(e) => setIncludeSummary(e.target.checked)}
              className="w-4 h-4 rounded border-[var(--border)] accent-[var(--color-primary)]"
            />
            <span className="type-meta text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">
              Include TL;DR Summary
            </span>
          </label>

          <label className="flex items-center gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={includeNotes}
              onChange={(e) => setIncludeNotes(e.target.checked)}
              className="w-4 h-4 rounded border-[var(--border)] accent-[var(--color-primary)]"
            />
            <span className="type-meta text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">
              Include Artist Notes
            </span>
          </label>

          <div className="flex items-center gap-3 opacity-50">
            <input
              type="checkbox"
              checked={false}
              disabled
              className="w-4 h-4 rounded border-[var(--border)]"
            />
            <span className="type-meta text-[var(--text-disabled)]">
              Internal Notes — never exported
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="type-meta px-4 py-2 border border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-strong)] rounded transition-all duration-150 hover-fade"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            className="type-meta px-4 py-2 bg-[var(--color-primary)] text-white rounded hover:opacity-90 hover-lift"
          >
            Export {format === 'docx' ? 'Word' : format.toUpperCase()}
          </button>
        </div>
      </div>
    </div>
  )
}
