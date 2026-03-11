'use client'

import { useState, useCallback, useEffect } from 'react'
import { ScanLine, Loader2, X, UserPlus, Tag, EyeOff, Check, ChevronDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/contexts/ToastContext'

interface DiscoveredName {
  name: string
  frequency: number
  confidence: number
  reasoning: string
  contexts: string[]
}

interface ManuscriptScanModalProps {
  open: boolean
  seriesId: string
  existingCharacters: Array<{
    id: string
    name: string
    display_name: string | null
    aliases: string[]
  }>
  onClose: () => void
  onCharactersAdded: () => void
}

type ScanState = 'scanning' | 'results' | 'empty' | 'error' | 'done'

export default function ManuscriptScanModal({
  open,
  seriesId,
  existingCharacters,
  onClose,
  onCharactersAdded,
}: ManuscriptScanModalProps) {
  const [state, setState] = useState<ScanState>('scanning')
  const [names, setNames] = useState<DiscoveredName[]>([])
  const [panelsScanned, setPanelsScanned] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')
  const [processingName, setProcessingName] = useState<string | null>(null)
  const [aliasDropdownOpen, setAliasDropdownOpen] = useState<string | null>(null)
  const [addedCount, setAddedCount] = useState(0)

  const { showToast } = useToast()

  // Run scan on mount
  useEffect(() => {
    if (!open) return

    let cancelled = false

    async function runScan() {
      try {
        const res = await fetch('/api/ai/manuscript-scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ seriesId }),
        })

        if (cancelled) return

        if (!res.ok) {
          const data = await res.json()
          setErrorMessage(data.error || 'Scan failed')
          setState('error')
          return
        }

        const data = await res.json()
        setPanelsScanned(data.panelsScanned || 0)

        if (!data.names || data.names.length === 0) {
          setState('empty')
        } else {
          setNames(data.names)
          setState('results')
        }
      } catch (err) {
        if (cancelled) return
        setErrorMessage(err instanceof Error ? err.message : 'Network error')
        setState('error')
      }
    }

    runScan()
    return () => { cancelled = true }
  }, [open, seriesId])

  const handleCreateCharacter = useCallback(
    async (name: string) => {
      setProcessingName(name)
      const supabase = createClient()

      const { error } = await supabase
        .from('characters')
        .insert({ series_id: seriesId, name })

      if (error) {
        showToast('Failed to create character: ' + error.message, 'error')
        setProcessingName(null)
        return
      }

      setNames(prev => prev.filter(n => n.name !== name))
      setAddedCount(prev => prev + 1)
      setProcessingName(null)
      showToast(`Created character "${name}"`, 'success')

      // Check if all handled
      setNames(prev => {
        if (prev.length === 0) {
          setState('done')
        }
        return prev
      })
    },
    [seriesId, showToast]
  )

  const handleAddAsAlias = useCallback(
    async (name: string, characterId: string) => {
      setProcessingName(name)
      setAliasDropdownOpen(null)
      const supabase = createClient()

      // Get current aliases
      const { data: char, error: fetchError } = await supabase
        .from('characters')
        .select('aliases')
        .eq('id', characterId)
        .single()

      if (fetchError || !char) {
        showToast('Failed to fetch character', 'error')
        setProcessingName(null)
        return
      }

      const currentAliases: string[] = char.aliases || []
      if (currentAliases.some(a => a.toLowerCase() === name.toLowerCase())) {
        // Already an alias, just remove from list
        setNames(prev => prev.filter(n => n.name !== name))
        setProcessingName(null)
        return
      }

      const { error } = await supabase
        .from('characters')
        .update({ aliases: [...currentAliases, name] })
        .eq('id', characterId)

      if (error) {
        showToast('Failed to add alias: ' + error.message, 'error')
        setProcessingName(null)
        return
      }

      setNames(prev => prev.filter(n => n.name !== name))
      setProcessingName(null)

      const targetChar = existingCharacters.find(c => c.id === characterId)
      showToast(
        `Added "${name}" as alias for ${targetChar?.display_name || targetChar?.name || 'character'}`,
        'success'
      )

      setNames(prev => {
        if (prev.length === 0) {
          setState('done')
        }
        return prev
      })
    },
    [existingCharacters, showToast]
  )

  const handleIgnore = useCallback(
    async (name: string) => {
      setProcessingName(name)
      const supabase = createClient()

      const { error } = await supabase
        .from('dismissed_character_names')
        .insert({ series_id: seriesId, name })

      if (error) {
        // Might be a duplicate, that's OK
        if (!error.message.includes('duplicate')) {
          showToast('Failed to dismiss name: ' + error.message, 'error')
          setProcessingName(null)
          return
        }
      }

      setNames(prev => prev.filter(n => n.name !== name))
      setProcessingName(null)

      setNames(prev => {
        if (prev.length === 0) {
          setState('done')
        }
        return prev
      })
    },
    [seriesId, showToast]
  )

  const handleClose = useCallback(() => {
    if (addedCount > 0) {
      onCharactersAdded()
    }
    onClose()
  }, [addedCount, onCharactersAdded, onClose])

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget && state !== 'scanning') {
        handleClose()
      }
    },
    [state, handleClose]
  )

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="scan-modal-title"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Dialog */}
      <div className="relative bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-6 max-w-lg w-full mx-4 shadow-xl animate-in fade-in zoom-in-95 duration-150 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ScanLine size={18} className="text-[var(--color-primary)]" />
            <h2
              id="scan-modal-title"
              className="text-base font-semibold text-[var(--text-primary)]"
            >
              Manuscript Scan
            </h2>
          </div>
          {state !== 'scanning' && (
            <button
              onClick={handleClose}
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {/* Scanning state */}
          {state === 'scanning' && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 size={32} className="animate-spin text-[var(--color-primary)]" />
              <p className="text-sm text-[var(--text-secondary)]">
                Scanning manuscript for character names...
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                This may take a moment.
              </p>
            </div>
          )}

          {/* Error state */}
          {state === 'error' && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <p className="text-sm text-[var(--color-error)]">{errorMessage}</p>
              <button
                onClick={handleClose}
                className="text-sm text-[var(--color-primary)] hover:underline"
              >
                Close
              </button>
            </div>
          )}

          {/* Empty state */}
          {state === 'empty' && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Check size={32} className="text-[var(--color-success)]" />
              <p className="text-sm text-[var(--text-secondary)]">
                No new character names found.
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                Scanned {panelsScanned} panel{panelsScanned !== 1 ? 's' : ''}.
              </p>
            </div>
          )}

          {/* Done state */}
          {state === 'done' && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Check size={32} className="text-[var(--color-success)]" />
              <p className="text-sm text-[var(--text-primary)] font-medium">
                All done!
              </p>
              {addedCount > 0 && (
                <p className="text-xs text-[var(--text-muted)]">
                  {addedCount} character{addedCount !== 1 ? 's' : ''} added.
                </p>
              )}
            </div>
          )}

          {/* Results */}
          {state === 'results' && (
            <div className="space-y-1">
              <p className="text-xs text-[var(--text-muted)] mb-3">
                Found {names.length} potential character name{names.length !== 1 ? 's' : ''} in{' '}
                {panelsScanned} panel{panelsScanned !== 1 ? 's' : ''}.
              </p>

              {names.map(item => (
                <div
                  key={item.name}
                  className={`p-3 border border-[var(--border)] rounded-lg transition-opacity ${
                    processingName === item.name ? 'opacity-50' : ''
                  }`}
                >
                  {/* Name + confidence */}
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-[var(--text-primary)]">
                      {item.name}
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)]">
                      {item.frequency}x
                    </span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                        item.confidence >= 0.7
                          ? 'bg-[var(--color-success)]/10 text-[var(--color-success)]'
                          : item.confidence >= 0.5
                          ? 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]'
                          : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]'
                      }`}
                    >
                      {Math.round(item.confidence * 100)}%
                    </span>
                  </div>

                  {/* Reasoning */}
                  <p className="text-xs text-[var(--text-muted)] mb-2">{item.reasoning}</p>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {/* Create Character */}
                    <button
                      onClick={() => handleCreateCharacter(item.name)}
                      disabled={processingName !== null}
                      className="flex items-center gap-1 text-[11px] font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-hover)] disabled:opacity-50 transition-colors"
                    >
                      <UserPlus size={12} />
                      Create
                    </button>

                    {/* Add as Alias */}
                    <div className="relative">
                      <button
                        onClick={() =>
                          setAliasDropdownOpen(
                            aliasDropdownOpen === item.name ? null : item.name
                          )
                        }
                        disabled={processingName !== null}
                        className="flex items-center gap-1 text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50 transition-colors"
                      >
                        <Tag size={12} />
                        Alias
                        <ChevronDown size={10} />
                      </button>

                      {aliasDropdownOpen === item.name && (
                        <div className="absolute top-full left-0 mt-1 z-10 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg shadow-lg py-1 min-w-[180px] max-h-48 overflow-y-auto">
                          {existingCharacters.map(c => (
                            <button
                              key={c.id}
                              onClick={() => handleAddAsAlias(item.name, c.id)}
                              className="w-full text-left px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                            >
                              {c.display_name || c.name}
                            </button>
                          ))}
                          {existingCharacters.length === 0 && (
                            <p className="px-3 py-2 text-xs text-[var(--text-muted)]">
                              No existing characters
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Ignore */}
                    <button
                      onClick={() => handleIgnore(item.name)}
                      disabled={processingName !== null}
                      className="flex items-center gap-1 text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text-secondary)] disabled:opacity-50 transition-colors"
                    >
                      <EyeOff size={12} />
                      Ignore
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {(state === 'results' || state === 'done' || state === 'empty' || state === 'error') && (
          <div className="flex justify-end mt-4 pt-4 border-t border-[var(--border)]">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium text-[var(--text-secondary)] bg-[var(--bg-tertiary)] hover:bg-[var(--border)] rounded transition-colors"
            >
              {state === 'done' || state === 'empty' ? 'Done' : 'Close'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
