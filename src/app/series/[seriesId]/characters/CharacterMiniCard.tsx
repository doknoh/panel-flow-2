'use client'

import { Check } from 'lucide-react'
import { Tip } from '@/components/ui/Tip'
import type { CharacterWithStats } from '@/lib/character-stats'

const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  protagonist: { bg: 'bg-[var(--color-primary)]/20', text: 'text-[var(--color-primary)]' },
  antagonist: { bg: 'bg-[var(--color-error)]/20', text: 'text-[var(--color-error)]' },
  supporting: { bg: 'bg-[var(--color-success)]/20', text: 'text-[var(--color-success)]' },
  recurring: { bg: 'bg-[var(--bg-tertiary)]', text: 'text-[var(--text-secondary)]' },
  minor: { bg: 'bg-[var(--bg-tertiary)]', text: 'text-[var(--text-muted)]' },
}

interface CharacterMiniCardProps {
  character: CharacterWithStats
  isSelected: boolean
  selectMode: boolean
  onSelect: (id: string) => void
  onClick: (id: string) => void
}

export default function CharacterMiniCard({
  character,
  isSelected,
  selectMode,
  onSelect,
  onClick,
}: CharacterMiniCardProps) {
  const role = character.role || 'minor'
  const roleStyle = ROLE_COLORS[role] || ROLE_COLORS.minor
  const totalPanels = character.stats?.totalPanels ?? 0

  const handleClick = () => {
    if (selectMode) {
      onSelect(character.id)
    } else {
      onClick(character.id)
    }
  }

  return (
    <div
      className={`flex items-center gap-3 h-10 px-3 rounded border cursor-pointer transition-all duration-150 hover-glow ${
        isSelected
          ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5'
          : 'border-[var(--border)] bg-[var(--bg-secondary)] hover:border-[var(--text-secondary)]'
      }`}
      onClick={handleClick}
    >
      {/* Checkbox in select mode */}
      {selectMode && (
        <div
          className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
            isSelected
              ? 'bg-[var(--color-primary)] border-[var(--color-primary)]'
              : 'border-[var(--text-secondary)] bg-[var(--bg-primary)]'
          }`}
        >
          {isSelected && <Check size={10} className="text-white" />}
        </div>
      )}

      {/* Name */}
      <span className="font-semibold text-sm text-[var(--text-primary)] truncate flex-1">
        {character.display_name || character.name}
      </span>

      {/* Role badge */}
      <Tip content={`Role: ${role}`}>
        <span
          className={`text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 hover-glow ${roleStyle.bg} ${roleStyle.text}`}
        >
          {role}
        </span>
      </Tip>

      {/* Panel count */}
      <Tip content={`${totalPanels} panels`}>
        <span className="text-xs font-medium text-[var(--text-muted)] tabular-nums shrink-0">
          {totalPanels}
        </span>
      </Tip>
    </div>
  )
}
