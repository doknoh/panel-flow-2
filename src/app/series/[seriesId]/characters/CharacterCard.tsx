'use client'

import { useMemo, useState } from 'react'
import { X, Check } from 'lucide-react'
import { Tip } from '@/components/ui/Tip'
import type { CharacterWithStats } from '@/lib/character-stats'
import { extractRelationshipRefs } from '@/lib/character-stats'

const ROLE_OPTIONS = ['protagonist', 'antagonist', 'supporting', 'recurring', 'minor'] as const

const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  protagonist: { bg: 'bg-[var(--color-primary)]/20', text: 'text-[var(--color-primary)]' },
  antagonist: { bg: 'bg-[var(--color-error)]/20', text: 'text-[var(--color-error)]' },
  supporting: { bg: 'bg-[var(--color-success)]/20', text: 'text-[var(--color-success)]' },
  recurring: { bg: 'bg-[var(--bg-tertiary)]', text: 'text-[var(--text-secondary)]' },
  minor: { bg: 'bg-[var(--bg-tertiary)]', text: 'text-[var(--text-muted)]' },
}

interface CharacterCardProps {
  character: CharacterWithStats
  issues: Array<{ id: string; number: number }>
  allCharacters: Array<{ id: string; name: string; display_name: string | null; aliases: string[] }>
  isSelected: boolean
  selectMode: boolean
  onSelect: (id: string) => void
  onClick: (id: string) => void
  onRoleChange: (id: string, role: string) => void
  onDelete: (id: string) => void
}

export default function CharacterCard({
  character,
  issues,
  allCharacters,
  isSelected,
  selectMode,
  onSelect,
  onClick,
  onRoleChange,
  onDelete,
}: CharacterCardProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [showRolePicker, setShowRolePicker] = useState(false)

  const stats = character.stats
  const totalPanels = stats?.totalPanels ?? 0
  const totalDialogues = stats?.totalDialogues ?? 0

  // Count issues this character appears in
  const issueCount = stats?.issueBreakdown
    ? Object.keys(stats.issueBreakdown).length
    : 0

  // Build alias line
  const aliasLine = useMemo(() => {
    const parts: string[] = []
    if (character.display_name && character.display_name !== character.name) {
      parts.push(character.display_name)
    }
    if (character.aliases?.length) {
      parts.push(...character.aliases)
    }
    return parts.length > 0 ? `aka ${parts.join(', ')}` : null
  }, [character.name, character.display_name, character.aliases])

  // Extract relationship refs
  const relationshipCharIds = useMemo(
    () =>
      extractRelationshipRefs(
        character.relationships,
        allCharacters.filter(c => c.id !== character.id)
      ),
    [character.relationships, allCharacters, character.id]
  )

  const relationshipChars = useMemo(
    () => allCharacters.filter(c => relationshipCharIds.includes(c.id)),
    [allCharacters, relationshipCharIds]
  )

  // Build heatmap data: one bar per issue, opacity scaled by relative panel count
  const heatmapData = useMemo(() => {
    if (!stats?.issueBreakdown || issues.length === 0) return []

    const maxPanels = Math.max(
      1,
      ...Object.values(stats.issueBreakdown).map(b => b.panels)
    )

    return issues.map(issue => {
      const breakdown = stats.issueBreakdown[issue.id]
      const panels = breakdown?.panels ?? 0
      const opacity = panels > 0 ? Math.max(0.15, panels / maxPanels) : 0
      return { issueId: issue.id, issueNumber: issue.number, panels, opacity }
    })
  }, [issues, stats?.issueBreakdown])

  const role = character.role || 'minor'
  const roleStyle = ROLE_COLORS[role] || ROLE_COLORS.minor

  const handleCardClick = () => {
    if (selectMode) {
      onSelect(character.id)
    } else {
      onClick(character.id)
    }
  }

  const handleRoleBadgeClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setShowRolePicker(prev => !prev)
  }

  const handleRoleSelect = (newRole: string) => {
    onRoleChange(character.id, newRole)
    setShowRolePicker(false)
  }

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onDelete(character.id)
  }

  const handleRelationshipClick = (e: React.MouseEvent, charId: string) => {
    e.stopPropagation()
    onClick(charId)
  }

  return (
    <div
      className={`relative rounded-lg border p-4 hover-glow ${
        isSelected
          ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5'
          : 'border-[var(--border)] bg-[var(--bg-secondary)] hover:border-[var(--text-secondary)]'
      }`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false)
        setShowRolePicker(false)
      }}
      onClick={handleCardClick}
    >
      {/* Select mode checkbox */}
      {selectMode && (
        <div className="absolute top-3 left-3 z-10">
          <div
            className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
              isSelected
                ? 'bg-[var(--color-primary)] border-[var(--color-primary)]'
                : 'border-[var(--text-secondary)] bg-[var(--bg-primary)]'
            }`}
          >
            {isSelected && <Check size={12} className="text-white" />}
          </div>
        </div>
      )}

      {/* Delete button on hover */}
      {isHovered && !selectMode && (
        <Tip content="Delete character">
          <button
            onClick={handleDeleteClick}
            className="absolute top-3 right-3 z-10 w-6 h-6 rounded flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--color-error)]/10 transition-colors hover-fade-danger"
          >
            <X size={14} />
          </button>
        </Tip>
      )}

      {/* Header row */}
      <div className={selectMode ? 'pl-7' : ''}>
        <div className="flex items-start gap-2 mb-1">
          <h3 className="font-bold text-[var(--text-primary)] text-base leading-tight truncate flex-1">
            {character.display_name || character.name}
          </h3>
        </div>

        {aliasLine && (
          <Tip content={aliasLine}>
            <p className="text-xs text-[var(--text-muted)] truncate mb-2">
              {aliasLine}
            </p>
          </Tip>
        )}

        {/* Role badge */}
        <div className="relative inline-block mb-3">
          <button
            onClick={handleRoleBadgeClick}
            className={`text-[0.625rem] font-semibold uppercase tracking-wider px-2 py-0.5 rounded hover-glow ${roleStyle.bg} ${roleStyle.text} hover:opacity-80`}
          >
            {role}
          </button>

          {showRolePicker && (
            <div className="absolute top-full left-0 mt-1 z-20 bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg shadow-lg py-1 min-w-[140px]">
              {ROLE_OPTIONS.map(opt => {
                const optStyle = ROLE_COLORS[opt]
                return (
                  <button
                    key={opt}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleRoleSelect(opt)
                    }}
                    className={`w-full text-left px-3 py-1.5 text-xs uppercase tracking-wider hover:bg-[var(--bg-secondary)] hover-glow ${
                      opt === role ? 'font-bold' : ''
                    } ${optStyle.text}`}
                  >
                    {opt}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-baseline gap-4 mb-3">
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-black text-[var(--text-primary)] leading-none tabular-nums">
            {totalPanels}
          </span>
          <span className="text-[0.625rem] text-[var(--text-muted)] uppercase tracking-wider">
            panels
          </span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-sm font-semibold text-[var(--text-secondary)] tabular-nums">
            {totalDialogues}
          </span>
          <span className="text-[0.625rem] text-[var(--text-muted)] uppercase tracking-wider">
            lines
          </span>
        </div>
        <div className="flex items-baseline gap-1 ml-auto">
          <span className="text-sm font-semibold text-[var(--text-secondary)] tabular-nums">
            {issueCount}/{issues.length}
          </span>
          <span className="text-[0.625rem] text-[var(--text-muted)] uppercase tracking-wider">
            issues
          </span>
        </div>
      </div>

      {/* Issue presence heatmap */}
      {heatmapData.length > 0 && (
        <div className="flex gap-0.5 mb-3">
          {heatmapData.map(bar => (
            <Tip key={bar.issueId} content={`Issue #${bar.issueNumber}: ${bar.panels} panels`}>
              <div
                className="flex-1 h-2 rounded-sm"
                style={{
                  backgroundColor: bar.opacity > 0 ? 'var(--color-primary)' : 'var(--bg-tertiary)',
                  opacity: bar.opacity > 0 ? bar.opacity : 1,
                }}
              />
            </Tip>
          ))}
        </div>
      )}

      {/* Relationship tags */}
      {relationshipChars.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {relationshipChars.map(rc => (
            <Tip key={rc.id} content={rc.display_name || rc.name}>
              <button
                onClick={(e) => handleRelationshipClick(e, rc.id)}
                className="text-[0.625rem] px-2 py-0.5 rounded-full bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--border)] truncate max-w-[120px] hover-glow"
              >
                {rc.display_name || rc.name}
              </button>
            </Tip>
          ))}
        </div>
      )}
    </div>
  )
}
