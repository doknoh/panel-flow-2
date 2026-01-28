'use client'

import { useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/contexts/ToastContext'

interface SeriesMetadataProps {
  seriesId: string
  initialLogline: string | null
  initialTheme: string | null
  initialVisualGrammar: string | null
  initialRules: string | null
}

export default function SeriesMetadata({
  seriesId,
  initialLogline,
  initialTheme,
  initialVisualGrammar,
  initialRules,
}: SeriesMetadataProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [logline, setLogline] = useState(initialLogline || '')
  const [theme, setTheme] = useState(initialTheme || '')
  const [visualGrammar, setVisualGrammar] = useState(initialVisualGrammar || '')
  const [rules, setRules] = useState(initialRules || '')
  const [isSaving, setIsSaving] = useState(false)
  const { showToast } = useToast()
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null)

  const saveField = useCallback(async (field: string, value: string) => {
    setIsSaving(true)
    const supabase = createClient()

    const { error } = await supabase
      .from('series')
      .update({ [field]: value || null })
      .eq('id', seriesId)

    if (error) {
      showToast('Failed to save', 'error')
    }
    setIsSaving(false)
  }, [seriesId, showToast])

  const handleFieldChange = (field: string, value: string, setter: (v: string) => void) => {
    setter(value)

    // Debounce save
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
    }
    saveTimerRef.current = setTimeout(() => {
      saveField(field, value)
    }, 1000)
  }

  return (
    <div className="mb-8">
      {/* Always visible summary */}
      <div className="space-y-2">
        {logline && (
          <p className="text-[var(--text-secondary)] text-lg">{logline}</p>
        )}
        {theme && (
          <p className="text-[var(--text-secondary)]">
            <span className="font-medium">Theme:</span> {theme}
          </p>
        )}
      </div>

      {/* Expand/Collapse toggle */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="mt-4 text-sm text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
      >
        {isExpanded ? '▼ Hide' : '▶ Edit'} Series Details
        {isSaving && <span className="text-[var(--text-secondary)] ml-2">(saving...)</span>}
      </button>

      {/* Expandable edit section */}
      {isExpanded && (
        <div className="mt-4 space-y-4 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
          <div>
            <label className="block text-sm text-[var(--text-secondary)] mb-1">Logline</label>
            <textarea
              value={logline}
              onChange={(e) => handleFieldChange('logline', e.target.value, setLogline)}
              placeholder="One paragraph concept for the series..."
              className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 text-sm resize-none focus:border-indigo-500 focus:outline-none"
              rows={2}
            />
          </div>

          <div>
            <label className="block text-sm text-[var(--text-secondary)] mb-1">Central Theme</label>
            <input
              type="text"
              value={theme}
              onChange={(e) => handleFieldChange('central_theme', e.target.value, setTheme)}
              placeholder="The core thematic exploration..."
              className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm text-[var(--text-secondary)] mb-1">
              Visual Grammar
              <span className="text-[var(--text-muted)] font-normal ml-2">
                (recurring visual devices across the series)
              </span>
            </label>
            <textarea
              value={visualGrammar}
              onChange={(e) => handleFieldChange('visual_grammar', e.target.value, setVisualGrammar)}
              placeholder="e.g., 9-panel grids for introspection, splash pages for revelations, specific color palettes for each plotline..."
              className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 text-sm resize-none focus:border-indigo-500 focus:outline-none"
              rows={3}
            />
          </div>

          <div>
            <label className="block text-sm text-[var(--text-secondary)] mb-1">
              Series Rules
              <span className="text-[var(--text-muted)] font-normal ml-2">
                (conventions that apply across all issues)
              </span>
            </label>
            <textarea
              value={rules}
              onChange={(e) => handleFieldChange('rules', e.target.value, setRules)}
              placeholder="e.g., Character names always in caps in descriptions, Media Chorus appears as inset panels, neural sequences use blue tint..."
              className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 text-sm resize-none focus:border-indigo-500 focus:outline-none"
              rows={3}
            />
          </div>
        </div>
      )}
    </div>
  )
}
