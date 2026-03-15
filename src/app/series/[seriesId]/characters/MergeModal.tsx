'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { Merge, Loader2, X } from 'lucide-react'
import { Tip } from '@/components/ui/Tip'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/contexts/ToastContext'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import type { CharacterWithStats } from '@/lib/character-stats'

interface MergeModalProps {
  open: boolean
  characters: CharacterWithStats[]
  seriesId: string
  onClose: () => void
  onMergeComplete: (primaryId: string, absorbedIds: string[]) => void
}

export default function MergeModal({
  open,
  characters,
  seriesId,
  onClose,
  onMergeComplete,
}: MergeModalProps) {
  const [primaryId, setPrimaryId] = useState<string>(characters[0]?.id ?? '')
  const [isMerging, setIsMerging] = useState(false)
  const { showToast } = useToast()
  const focusTrapRef = useFocusTrap(open)

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isMerging) onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, isMerging, onClose])

  const absorbedCharacters = useMemo(
    () => characters.filter(c => c.id !== primaryId),
    [characters, primaryId]
  )

  const primaryCharacter = useMemo(
    () => characters.find(c => c.id === primaryId),
    [characters, primaryId]
  )

  const totalDialogueCount = useMemo(
    () => absorbedCharacters.reduce((sum, c) => sum + (c.stats?.totalDialogues ?? 0), 0),
    [absorbedCharacters]
  )

  const executeMerge = useCallback(async () => {
    if (!primaryId || absorbedCharacters.length === 0) return

    setIsMerging(true)
    const supabase = createClient()
    const absorbedIds = absorbedCharacters.map(c => c.id)

    try {
      // 1. Snapshot absorbed characters for undo
      const { data: characterSnapshot } = await supabase
        .from('characters')
        .select('*')
        .in('id', absorbedIds)

      if (!characterSnapshot || characterSnapshot.length === 0) {
        showToast('Failed to snapshot characters for merge', 'error')
        setIsMerging(false)
        return
      }

      // C5: Snapshot dialogue block mappings BEFORE reassignment
      const { data: dialogueSnapshot } = await supabase
        .from('dialogue_blocks')
        .select('id, character_id')
        .in('character_id', absorbedIds)

      // C6: Snapshot character_states and dialogue_flags for absorbed characters
      const { data: statesSnapshot } = await supabase
        .from('character_states')
        .select('*')
        .in('character_id', absorbedIds)

      const { data: flagsSnapshot } = await supabase
        .from('dialogue_flags')
        .select('*')
        .in('character_id', absorbedIds)

      // C7: Select aliases and series_id from primary
      const { data: primary } = await supabase
        .from('characters')
        .select('aliases, series_id')
        .eq('id', primaryId)
        .single()

      if (!primary) {
        showToast('Failed to read primary character', 'error')
        setIsMerging(false)
        return
      }

      const originalAliases = primary.aliases || []

      // 5. Add absorbed names as aliases on primary (deduplicated)
      const absorbedNames = absorbedCharacters.flatMap(c => {
        const names = [c.name]
        if (c.display_name && c.display_name !== c.name) names.push(c.display_name)
        if (c.aliases) names.push(...c.aliases)
        return names
      })

      const existingAliasSet = new Set(
        (originalAliases || []).map((a: string) => a.toLowerCase())
      )
      // Also exclude the primary character's own name
      if (primaryCharacter) {
        existingAliasSet.add(primaryCharacter.name.toLowerCase())
        if (primaryCharacter.display_name) {
          existingAliasSet.add(primaryCharacter.display_name.toLowerCase())
        }
      }

      const newAliases = absorbedNames.filter(
        n => n && !existingAliasSet.has(n.toLowerCase())
      )
      const mergedAliases = [...(originalAliases || []), ...newAliases]

      const { error: aliasError } = await supabase
        .from('characters')
        .update({ aliases: mergedAliases })
        .eq('id', primaryId)

      if (aliasError) {
        showToast('Failed to update aliases: ' + aliasError.message, 'error')
        setIsMerging(false)
        return
      }

      // 6. Reassign dialogue blocks to primary
      if (dialogueSnapshot && dialogueSnapshot.length > 0) {
        const { error: dialogueError } = await supabase
          .from('dialogue_blocks')
          .update({ character_id: primaryId })
          .in('character_id', absorbedIds)

        if (dialogueError) {
          showToast('Failed to reassign dialogues: ' + dialogueError.message, 'error')
          // Rollback aliases
          await supabase
            .from('characters')
            .update({ aliases: originalAliases })
            .eq('id', primaryId)
          setIsMerging(false)
          return
        }
      }

      // 7. Delete voice profiles for absorbed chars
      await supabase
        .from('character_voice_profiles')
        .delete()
        .in('character_id', absorbedIds)

      // 8. Delete absorbed characters
      const { error: deleteError } = await supabase
        .from('characters')
        .delete()
        .in('id', absorbedIds)

      if (deleteError) {
        showToast('Failed to delete absorbed characters: ' + deleteError.message, 'error')
        setIsMerging(false)
        return
      }

      // 9. Trigger stats recompute
      try {
        await fetch('/api/characters/stats/recompute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ seriesId: primary.series_id }),
        })
      } catch {
        // Non-critical, stats will be recomputed on next refresh
      }

      // Notify parent
      onMergeComplete(primaryId, absorbedIds)
      onClose()

      // Undo toast (10s)
      showToast('Characters merged', 'success', {
        duration: 10000,
        action: {
          label: 'Undo',
          onClick: async () => {
            // Restore absorbed characters from snapshot
            for (const char of characterSnapshot) {
              await supabase.from('characters').insert(char)
            }
            // Restore dialogue block mappings from C5 snapshot
            if (dialogueSnapshot && dialogueSnapshot.length > 0) {
              for (const d of dialogueSnapshot) {
                await supabase
                  .from('dialogue_blocks')
                  .update({ character_id: d.character_id })
                  .eq('id', d.id)
              }
            }
            // Restore character_states from C6 snapshot
            if (statesSnapshot && statesSnapshot.length > 0) {
              await supabase.from('character_states').insert(statesSnapshot)
            }
            // Restore dialogue_flags from C6 snapshot
            if (flagsSnapshot && flagsSnapshot.length > 0) {
              await supabase.from('dialogue_flags').insert(flagsSnapshot)
            }
            // Restore primary's original aliases
            await supabase
              .from('characters')
              .update({ aliases: originalAliases })
              .eq('id', primaryId)

            // Trigger stats recompute after undo
            try {
              await fetch('/api/characters/stats/recompute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ seriesId: primary.series_id }),
              })
            } catch {
              // Non-critical
            }

            // Notify parent to refresh
            // The parent should re-fetch characters after undo
            window.location.reload()
          },
        },
      })
    } catch (err) {
      showToast(
        'Merge failed: ' + (err instanceof Error ? err.message : 'Unknown error'),
        'error'
      )
    } finally {
      setIsMerging(false)
    }
  }, [primaryId, absorbedCharacters, primaryCharacter, seriesId, showToast, onMergeComplete, onClose])

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget && !isMerging) {
        onClose()
      }
    },
    [onClose, isMerging]
  )

  if (!open || characters.length < 2) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="merge-modal-title"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Dialog */}
      <div ref={focusTrapRef} className="relative bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-6 max-w-md w-full mx-4 shadow-xl animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Merge size={18} className="text-[var(--color-primary)]" />
            <h2
              id="merge-modal-title"
              className="text-base font-semibold text-[var(--text-primary)]"
            >
              Merge Characters
            </h2>
          </div>
          {!isMerging && (
            <Tip content="Close">
              <button
                onClick={onClose}
                className="text-[var(--text-muted)] hover-fade"
              >
                <X size={18} />
              </button>
            </Tip>
          )}
        </div>

        {/* Primary selection */}
        <div className="mb-4">
          <p className="text-xs font-medium text-[var(--text-secondary)] mb-2">
            Select the primary character (survives):
          </p>
          <div className="space-y-2">
            {characters.map(c => (
              <label
                key={c.id}
                className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                  primaryId === c.id
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5'
                    : 'border-[var(--border)] hover:border-[var(--text-muted)]'
                }`}
              >
                <input
                  type="radio"
                  name="primary-character"
                  value={c.id}
                  checked={primaryId === c.id}
                  onChange={() => setPrimaryId(c.id)}
                  disabled={isMerging}
                  className="accent-[var(--color-primary)]"
                />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-[var(--text-primary)]">
                    {c.display_name || c.name}
                  </span>
                  {c.role && (
                    <span className="ml-2 text-[0.625rem] uppercase tracking-wider text-[var(--text-muted)]">
                      {c.role}
                    </span>
                  )}
                </div>
                <span className="text-xs text-[var(--text-muted)]">
                  {c.stats?.totalDialogues ?? 0} lines
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Preview */}
        {primaryCharacter && absorbedCharacters.length > 0 && (
          <div className="mb-4 p-3 bg-[var(--bg-tertiary)] rounded-lg">
            <p className="text-xs text-[var(--text-secondary)]">
              <span className="font-semibold text-[var(--text-primary)]">
                {primaryCharacter.display_name || primaryCharacter.name}
              </span>{' '}
              will absorb:{' '}
              <span className="font-medium">
                {absorbedCharacters
                  .map(c => c.display_name || c.name)
                  .join(', ')}
              </span>
            </p>
            {totalDialogueCount > 0 && (
              <p className="text-xs text-[var(--text-muted)] mt-1">
                {totalDialogueCount} dialogue block{totalDialogueCount !== 1 ? 's' : ''} will be
                reassigned.
              </p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isMerging}
            className="px-4 py-2 text-sm font-medium text-[var(--text-secondary)] bg-[var(--bg-tertiary)] hover:bg-[var(--border)] rounded transition-colors disabled:opacity-50 hover-fade"
          >
            Cancel
          </button>
          <button
            onClick={executeMerge}
            disabled={isMerging || !primaryId}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-[var(--color-primary)] text-white rounded hover:opacity-90 disabled:opacity-50 hover-lift"
          >
            {isMerging ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Merging...
              </>
            ) : (
              <>
                <Merge size={14} />
                Merge
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
