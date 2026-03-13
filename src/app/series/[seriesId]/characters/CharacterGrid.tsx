'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import {
  Plus,
  RefreshCw,
  CheckSquare,
  Square,
  Search,
  ArrowDownAZ,
  Trash2,
  Merge,
  ScanLine,
  X,
} from 'lucide-react'
import { Tip } from '@/components/ui/Tip'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/contexts/ToastContext'
import ConfirmDialog, { useConfirmDialog } from '@/components/ui/ConfirmDialog'
import type { CharacterWithStats, CharacterStats } from '@/lib/character-stats'
import CharacterCard from './CharacterCard'
import CharacterMiniCard from './CharacterMiniCard'
import CharacterDetailPanel from './CharacterDetailPanel'
import MergeModal from './MergeModal'
import ManuscriptScanModal from './ManuscriptScanModal'

const MINOR_THRESHOLD = 5

const ROLE_OPTIONS = [
  { value: 'protagonist', label: 'Protagonist' },
  { value: 'antagonist', label: 'Antagonist' },
  { value: 'supporting', label: 'Supporting' },
  { value: 'recurring', label: 'Recurring' },
  { value: 'minor', label: 'Minor' },
] as const

const SORT_OPTIONS = [
  { value: 'panels', label: 'Panel Count' },
  { value: 'alpha', label: 'Alphabetical' },
  { value: 'role', label: 'Role' },
  { value: 'issues', label: 'Issue Spread' },
  { value: 'dialogues', label: 'Dialogue Count' },
] as const

type SortBy = (typeof SORT_OPTIONS)[number]['value']

const ROLE_PRIORITY: Record<string, number> = {
  protagonist: 0,
  antagonist: 1,
  supporting: 2,
  recurring: 3,
  minor: 4,
}

interface CharacterGridProps {
  seriesId: string
  initialCharacters: CharacterWithStats[]
  initialStats: Map<string, CharacterStats>
  issues: Array<{ id: string; number: number; title: string }>
  plotlines: Array<{ id: string; name: string }>
  initialStale?: boolean
}

export default function CharacterGrid({
  seriesId,
  initialCharacters,
  initialStats,
  issues,
  plotlines,
  initialStale = false,
}: CharacterGridProps) {
  const [characters, setCharacters] = useState<CharacterWithStats[]>(initialCharacters)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [selectMode, setSelectMode] = useState(false)
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<SortBy>('panels')
  const [roleFilter, setRoleFilter] = useState<Set<string>>(new Set())
  const [issueFilter, setIssueFilter] = useState<string>('')
  const [plotlineFilter, setPlotlineFilter] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isStale, setIsStale] = useState(initialStale)
  const [showMergeModal, setShowMergeModal] = useState(false)
  const [showScanModal, setShowScanModal] = useState(false)

  const { showToast } = useToast()
  const { confirm, dialogProps } = useConfirmDialog()

  // All characters for relationship lookups
  const allCharactersLookup = useMemo(
    () =>
      characters.map(c => ({
        id: c.id,
        name: c.name,
        display_name: c.display_name,
        aliases: c.aliases,
      })),
    [characters]
  )

  // --- Filtering ---
  const filteredCharacters = useMemo(() => {
    let result = characters

    // Role filter
    if (roleFilter.size > 0) {
      result = result.filter(c => roleFilter.has(c.role || 'minor'))
    }

    // Issue filter
    if (issueFilter) {
      result = result.filter(c => {
        const breakdown = c.stats?.issueBreakdown
        return breakdown && breakdown[issueFilter] && breakdown[issueFilter].panels > 0
      })
    }

    // Plotline filter -- matches characters that appear in scenes associated with that plotline
    // This is a best-effort filter: we check if the character's sceneIds overlap with scenes
    // that have the selected plotline. Full plotline-to-scene data would be needed for accuracy.
    // For now, we include all characters when plotline filter is set (data not available client-side).
    // Plotline filtering can be improved once scene-plotline mapping is loaded.

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      result = result.filter(c => {
        if (c.name.toLowerCase().includes(q)) return true
        if (c.display_name?.toLowerCase().includes(q)) return true
        if (c.aliases?.some(a => a.toLowerCase().includes(q))) return true
        return false
      })
    }

    return result
  }, [characters, roleFilter, issueFilter, searchQuery])

  // --- Sorting ---
  const sortedCharacters = useMemo(() => {
    const sorted = [...filteredCharacters]

    switch (sortBy) {
      case 'panels':
        sorted.sort((a, b) => (b.stats?.totalPanels ?? 0) - (a.stats?.totalPanels ?? 0))
        break
      case 'alpha':
        sorted.sort((a, b) => a.name.localeCompare(b.name))
        break
      case 'role':
        sorted.sort((a, b) => {
          const rDiff =
            (ROLE_PRIORITY[a.role || 'minor'] ?? 4) - (ROLE_PRIORITY[b.role || 'minor'] ?? 4)
          if (rDiff !== 0) return rDiff
          return (b.stats?.totalPanels ?? 0) - (a.stats?.totalPanels ?? 0)
        })
        break
      case 'issues':
        sorted.sort((a, b) => {
          const aCount = Object.keys(a.stats?.issueBreakdown ?? {}).length
          const bCount = Object.keys(b.stats?.issueBreakdown ?? {}).length
          return bCount - aCount
        })
        break
      case 'dialogues':
        sorted.sort((a, b) => (b.stats?.totalDialogues ?? 0) - (a.stats?.totalDialogues ?? 0))
        break
    }

    return sorted
  }, [filteredCharacters, sortBy])

  // Split into main and minor
  const { mainCharacters, minorCharacters } = useMemo(() => {
    const main: CharacterWithStats[] = []
    const minor: CharacterWithStats[] = []
    for (const c of sortedCharacters) {
      if ((c.stats?.totalPanels ?? 0) < MINOR_THRESHOLD) {
        minor.push(c)
      } else {
        main.push(c)
      }
    }
    return { mainCharacters: main, minorCharacters: minor }
  }, [sortedCharacters])

  // --- Actions ---

  const handleAddCharacter = useCallback(async () => {
    const supabase = createClient()
    const tempId = `temp-${Date.now()}`
    const newChar: CharacterWithStats = {
      id: tempId,
      name: 'New Character',
      display_name: null,
      role: null,
      aliases: [],
      physical_description: null,
      background: null,
      personality_traits: null,
      speech_patterns: null,
      relationships: null,
      arc_notes: null,
      age: null,
      eye_color: null,
      hair_color_style: null,
      height: null,
      build: null,
      skin_tone: null,
      distinguishing_marks: null,
      style_wardrobe: null,
      first_appearance: null,
      color: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      stats: null,
    }

    setCharacters(prev => [newChar, ...prev])
    showToast('Character created', 'success')

    const { data, error } = await supabase
      .from('characters')
      .insert({ series_id: seriesId, name: 'New Character' })
      .select('*')
      .single()

    if (error) {
      setCharacters(prev => prev.filter(c => c.id !== tempId))
      showToast('Failed to create character: ' + error.message, 'error')
    } else if (data) {
      setCharacters(prev =>
        prev.map(c => (c.id === tempId ? { ...c, ...data, stats: null } : c))
      )
      setSelectedCharacterId(data.id)
    }
  }, [seriesId, showToast])

  const handleRefreshStats = useCallback(async () => {
    setIsRefreshing(true)
    try {
      const res = await fetch('/api/characters/stats/recompute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seriesId }),
      })

      if (!res.ok) {
        throw new Error('Failed to recompute stats')
      }

      const data = await res.json()
      const statsObj = data.stats as Record<string, CharacterStats>

      setCharacters(prev =>
        prev.map(c => ({
          ...c,
          stats: statsObj[c.id] || c.stats,
        }))
      )

      setIsStale(false)
      showToast('Stats refreshed', 'success')
    } catch {
      showToast('Failed to refresh stats', 'error')
    } finally {
      setIsRefreshing(false)
    }
  }, [seriesId, showToast])

  // Auto-refresh stats on mount when cache is stale
  const hasAutoRefreshed = useRef(false)
  useEffect(() => {
    if (isStale && !hasAutoRefreshed.current) {
      hasAutoRefreshed.current = true
      handleRefreshStats()
    }
  }, [isStale, handleRefreshStats])

  const handleRoleChange = useCallback(
    async (characterId: string, role: string) => {
      const prev = characters.find(c => c.id === characterId)
      if (!prev) return

      setCharacters(cs =>
        cs.map(c => (c.id === characterId ? { ...c, role } : c))
      )

      const supabase = createClient()
      const { error } = await supabase
        .from('characters')
        .update({ role })
        .eq('id', characterId)

      if (error) {
        setCharacters(cs =>
          cs.map(c => (c.id === characterId ? { ...c, role: prev.role } : c))
        )
        showToast('Failed to update role', 'error')
      }
    },
    [characters, showToast]
  )

  const handleDelete = useCallback(
    async (characterId: string) => {
      const character = characters.find(c => c.id === characterId)
      if (!character) return

      const supabase = createClient()

      // Query dialogue count for impact display
      const { count: dialogueCount } = await supabase
        .from('dialogue_blocks')
        .select('id', { count: 'exact', head: true })
        .eq('character_id', characterId)

      const impactDesc = dialogueCount && dialogueCount > 0
        ? `This character will be permanently removed. ${dialogueCount} dialogue block${dialogueCount !== 1 ? 's' : ''} will be unlinked.`
        : 'This character will be permanently removed.'

      const confirmed = await confirm({
        title: `Delete "${character.display_name || character.name}"?`,
        description: impactDesc,
      })
      if (!confirmed) return

      // Snapshot the character
      const { data: charSnapshot } = await supabase
        .from('characters')
        .select('*')
        .eq('id', characterId)
        .single()

      // C5: Snapshot dialogue block mappings
      const { data: dialogueSnapshot } = await supabase
        .from('dialogue_blocks')
        .select('id, character_id')
        .eq('character_id', characterId)

      // Nullify dialogue_blocks.character_id
      if (dialogueSnapshot && dialogueSnapshot.length > 0) {
        await supabase
          .from('dialogue_blocks')
          .update({ character_id: null })
          .eq('character_id', characterId)
      }

      // Delete the character
      const { error } = await supabase.from('characters').delete().eq('id', characterId)

      if (error) {
        // Rollback dialogue blocks
        if (dialogueSnapshot && dialogueSnapshot.length > 0) {
          for (const d of dialogueSnapshot) {
            await supabase
              .from('dialogue_blocks')
              .update({ character_id: d.character_id })
              .eq('id', d.id)
          }
        }
        showToast('Failed to delete character: ' + error.message, 'error')
        return
      }

      // Remove from state
      setCharacters(prev => prev.filter(c => c.id !== characterId))
      setSelectedIds(prev => {
        const next = new Set(prev)
        next.delete(characterId)
        return next
      })
      if (selectedCharacterId === characterId) {
        setSelectedCharacterId(null)
      }

      // Undo toast (10s)
      showToast('Character deleted', 'success', {
        duration: 10000,
        action: {
          label: 'Undo',
          onClick: async () => {
            if (charSnapshot) {
              await supabase.from('characters').insert(charSnapshot)
            }
            if (dialogueSnapshot && dialogueSnapshot.length > 0) {
              for (const d of dialogueSnapshot) {
                await supabase
                  .from('dialogue_blocks')
                  .update({ character_id: d.character_id })
                  .eq('id', d.id)
              }
            }
            // Re-add to state
            if (charSnapshot) {
              setCharacters(prev =>
                [...prev, { ...charSnapshot, stats: character.stats } as CharacterWithStats]
                  .sort((a, b) => a.name.localeCompare(b.name))
              )
            }
          },
        },
      })
    },
    [characters, confirm, selectedCharacterId, showToast]
  )

  const handleDeleteSelected = useCallback(async () => {
    if (selectedIds.size === 0) return

    const supabase = createClient()
    const toDeleteIds = Array.from(selectedIds)
    const toDeleteChars = characters.filter(c => selectedIds.has(c.id))
    const names = toDeleteChars.map(c => c.display_name || c.name)

    // Query dialogue count for impact display
    const { count: dialogueCount } = await supabase
      .from('dialogue_blocks')
      .select('id', { count: 'exact', head: true })
      .in('character_id', toDeleteIds)

    const impactDesc = dialogueCount && dialogueCount > 0
      ? `This will permanently remove: ${names.join(', ')}. ${dialogueCount} dialogue block${dialogueCount !== 1 ? 's' : ''} will be unlinked.`
      : `This will permanently remove: ${names.join(', ')}`

    const confirmed = await confirm({
      title: `Delete ${selectedIds.size} character(s)?`,
      description: impactDesc,
    })
    if (!confirmed) return

    // Snapshot characters
    const { data: charSnapshots } = await supabase
      .from('characters')
      .select('*')
      .in('id', toDeleteIds)

    // C5: Snapshot dialogue block mappings
    const { data: dialogueSnapshot } = await supabase
      .from('dialogue_blocks')
      .select('id, character_id')
      .in('character_id', toDeleteIds)

    // Nullify dialogue_blocks.character_id
    if (dialogueSnapshot && dialogueSnapshot.length > 0) {
      await supabase
        .from('dialogue_blocks')
        .update({ character_id: null })
        .in('character_id', toDeleteIds)
    }

    // Delete characters
    const { error } = await supabase
      .from('characters')
      .delete()
      .in('id', toDeleteIds)

    if (error) {
      // Rollback dialogue blocks
      if (dialogueSnapshot && dialogueSnapshot.length > 0) {
        for (const d of dialogueSnapshot) {
          await supabase
            .from('dialogue_blocks')
            .update({ character_id: d.character_id })
            .eq('id', d.id)
        }
      }
      showToast('Failed to delete characters: ' + error.message, 'error')
      return
    }

    // Remove from state
    setCharacters(prev => prev.filter(c => !selectedIds.has(c.id)))
    setSelectedIds(new Set())
    if (selectedCharacterId && selectedIds.has(selectedCharacterId)) {
      setSelectedCharacterId(null)
    }

    // One undo toast for all
    showToast(`${toDeleteIds.length} character(s) deleted`, 'success', {
      duration: 10000,
      action: {
        label: 'Undo',
        onClick: async () => {
          if (charSnapshots && charSnapshots.length > 0) {
            for (const char of charSnapshots) {
              await supabase.from('characters').insert(char)
            }
          }
          if (dialogueSnapshot && dialogueSnapshot.length > 0) {
            for (const d of dialogueSnapshot) {
              await supabase
                .from('dialogue_blocks')
                .update({ character_id: d.character_id })
                .eq('id', d.id)
            }
          }
          // Re-add to state
          if (charSnapshots) {
            const restored = charSnapshots.map(cs => {
              const original = toDeleteChars.find(c => c.id === cs.id)
              return { ...cs, stats: original?.stats ?? null } as CharacterWithStats
            })
            setCharacters(prev =>
              [...prev, ...restored].sort((a, b) => a.name.localeCompare(b.name))
            )
          }
        },
      },
    })
  }, [selectedIds, characters, confirm, selectedCharacterId, showToast])

  const handleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const handleCharacterUpdate = useCallback(
    (updated: CharacterWithStats) => {
      setCharacters(prev =>
        prev.map(c => (c.id === updated.id ? updated : c))
      )
    },
    []
  )

  const handleMergeComplete = useCallback(
    (primaryId: string, absorbedIds: string[]) => {
      setCharacters(prev => prev.filter(c => !absorbedIds.includes(c.id)))
      setSelectedIds(new Set())
      if (selectedCharacterId && absorbedIds.includes(selectedCharacterId)) {
        setSelectedCharacterId(null)
      }
    },
    [selectedCharacterId]
  )

  const handleScanCharactersAdded = useCallback(() => {
    // Refresh the page to pick up newly created characters
    window.location.reload()
  }, [])

  const mergeCharacters = useMemo(
    () => characters.filter(c => selectedIds.has(c.id)),
    [characters, selectedIds]
  )

  const handleCardClick = useCallback((id: string) => {
    setSelectedCharacterId(id)
  }, [])

  const toggleSelectMode = useCallback(() => {
    setSelectMode(prev => {
      if (prev) {
        setSelectedIds(new Set())
      }
      return !prev
    })
  }, [])

  const toggleRoleFilter = useCallback((role: string) => {
    setRoleFilter(prev => {
      const next = new Set(prev)
      if (next.has(role)) {
        next.delete(role)
      } else {
        next.add(role)
      }
      return next
    })
  }, [])

  return (
    <div className="space-y-4">
      <ConfirmDialog {...dialogProps} />

      {/* Filter bar */}
      <div className="sticky top-0 z-10 bg-[var(--bg-primary)] pb-3 pt-1 -mx-1 px-1 space-y-3">
        {/* Row 1: Role chips + Search */}
        <div className="flex items-center gap-2 flex-wrap">
          {ROLE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => toggleRoleFilter(opt.value)}
              className={`text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full border hover-glow ${
                roleFilter.has(opt.value)
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                  : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--text-secondary)]'
              }`}
            >
              {opt.label}
            </button>
          ))}

          {/* Issue dropdown */}
          <select
            value={issueFilter}
            onChange={e => setIssueFilter(e.target.value)}
            className="text-xs bg-[var(--bg-secondary)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text-secondary)] focus:border-[var(--color-primary)] focus:outline-none hover-glow"
          >
            <option value="">All Issues</option>
            {issues.map(issue => (
              <option key={issue.id} value={issue.id}>
                Issue #{issue.number}
              </option>
            ))}
          </select>

          {/* Plotline dropdown */}
          {plotlines.length > 0 && (
            <select
              value={plotlineFilter}
              onChange={e => setPlotlineFilter(e.target.value)}
              className="text-xs bg-[var(--bg-secondary)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text-secondary)] focus:border-[var(--color-primary)] focus:outline-none hover-glow"
            >
              <option value="">All Plotlines</option>
              {plotlines.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}

          {/* Search */}
          <div className="relative ml-auto">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search characters..."
              className="text-xs bg-[var(--bg-secondary)] border border-[var(--border)] rounded pl-8 pr-3 py-1.5 w-48 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--color-primary)] focus:outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover-fade"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Row 2: Toolbar */}
        <div className="flex items-center gap-2">
          {/* Scan Manuscript */}
          <Tip content="Scan manuscript for characters">
            <button
              onClick={() => setShowScanModal(true)}
              className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)] border border-[var(--border)] rounded px-3 py-1.5 hover:border-[var(--text-secondary)] transition-colors hover-fade"
            >
              <ScanLine size={14} />
              Scan Manuscript
            </button>
          </Tip>

          {/* Refresh Stats */}
          <Tip content="Refresh stats from manuscript">
            <button
              onClick={handleRefreshStats}
              disabled={isRefreshing}
              className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)] border border-[var(--border)] rounded px-3 py-1.5 hover:border-[var(--text-secondary)] transition-colors disabled:opacity-50 hover-fade"
            >
              <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
              {isRefreshing ? 'Refreshing...' : 'Refresh Stats'}
            </button>
          </Tip>

          {/* Select mode toggle */}
          <button
            onClick={toggleSelectMode}
            className={`flex items-center gap-1.5 text-xs font-medium border rounded px-3 py-1.5 transition-colors hover-fade ${
              selectMode
                ? 'border-[var(--color-primary)] text-[var(--color-primary)] bg-[var(--color-primary)]/5'
                : 'border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-secondary)]'
            }`}
          >
            {selectMode ? <CheckSquare size={14} /> : <Square size={14} />}
            {selectMode ? 'Done' : 'Select'}
          </button>

          {/* Sort dropdown */}
          <div className="flex items-center gap-1.5 ml-auto">
            <ArrowDownAZ size={14} className="text-[var(--text-muted)]" />
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as SortBy)}
              className="text-xs bg-[var(--bg-secondary)] border border-[var(--border)] rounded px-2 py-1.5 text-[var(--text-secondary)] focus:border-[var(--color-primary)] focus:outline-none hover-glow"
            >
              {SORT_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Add button */}
          <button
            onClick={handleAddCharacter}
            className="flex items-center gap-1.5 text-xs font-medium bg-[var(--color-primary)] text-white rounded px-3 py-1.5 hover:opacity-90 hover-lift"
          >
            <Plus size={14} />
            Add
          </button>
        </div>

        {/* Select mode actions */}
        {selectMode && selectedIds.size > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg">
            <span className="text-xs text-[var(--text-secondary)]">
              {selectedIds.size} selected
            </span>
            <div className="flex-1" />
            {selectedIds.size >= 2 && (
              <Tip content="Merge selected characters">
                <button
                  onClick={() => setShowMergeModal(true)}
                  className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)] border border-[var(--border)] rounded px-3 py-1.5 hover:border-[var(--text-secondary)] transition-colors hover-fade"
                >
                  <Merge size={14} />
                  Merge
                </button>
              </Tip>
            )}
            <button
              onClick={handleDeleteSelected}
              className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-error)] border border-[var(--color-error)]/30 rounded px-3 py-1.5 hover:bg-[var(--color-error)]/10 transition-colors hover-fade-danger"
            >
              <Trash2 size={14} />
              Delete Selected
            </button>
          </div>
        )}

        {/* Stale indicator */}
        {isStale && !isRefreshing && (
          <div className="flex items-center gap-2 px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded text-xs text-[var(--text-muted)]">
            Stats may be outdated.
            <button
              onClick={handleRefreshStats}
              className="text-[var(--color-primary)] hover:underline font-medium"
            >
              Refresh now
            </button>
          </div>
        )}
      </div>

      {/* Main grid */}
      {mainCharacters.length === 0 && minorCharacters.length === 0 ? (
        <div className="text-center py-12 text-[var(--text-muted)]">
          {searchQuery || roleFilter.size > 0 || issueFilter
            ? 'No characters match the current filters.'
            : 'No characters yet. Add one to get started.'}
        </div>
      ) : (
        <>
          {mainCharacters.length > 0 && (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
              {mainCharacters.map(character => (
                <CharacterCard
                  key={character.id}
                  character={character}
                  issues={issues}
                  allCharacters={allCharactersLookup}
                  isSelected={selectedIds.has(character.id)}
                  selectMode={selectMode}
                  onSelect={handleSelect}
                  onClick={handleCardClick}
                  onRoleChange={handleRoleChange}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}

          {/* Minor Characters section */}
          {minorCharacters.length > 0 && (
            <div className="mt-6">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
                Minor Characters ({minorCharacters.length})
              </h3>
              <div className="space-y-1">
                {minorCharacters.map(character => (
                  <CharacterMiniCard
                    key={character.id}
                    character={character}
                    isSelected={selectedIds.has(character.id)}
                    selectMode={selectMode}
                    onSelect={handleSelect}
                    onClick={handleCardClick}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* CharacterDetailPanel */}
      {selectedCharacterId && (() => {
        const selectedChar = characters.find(c => c.id === selectedCharacterId)
        if (!selectedChar) return null
        return (
          <CharacterDetailPanel
            character={selectedChar}
            seriesId={seriesId}
            issues={issues}
            allCharacters={allCharactersLookup}
            isOpen={!!selectedCharacterId}
            onClose={() => setSelectedCharacterId(null)}
            onCharacterUpdate={handleCharacterUpdate}
            onDelete={handleDelete}
          />
        )
      })()}

      {/* MergeModal */}
      {showMergeModal && mergeCharacters.length >= 2 && (
        <MergeModal
          open={showMergeModal}
          characters={mergeCharacters}
          seriesId={seriesId}
          onClose={() => setShowMergeModal(false)}
          onMergeComplete={handleMergeComplete}
        />
      )}

      {/* ManuscriptScanModal */}
      {showScanModal && (
        <ManuscriptScanModal
          open={showScanModal}
          seriesId={seriesId}
          existingCharacters={allCharactersLookup}
          onClose={() => setShowScanModal(false)}
          onCharactersAdded={handleScanCharactersAdded}
        />
      )}
    </div>
  )
}
