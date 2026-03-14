'use client'

import { useFontScale } from '@/contexts/FontScaleContext'
import { getFontScaleLabel } from '@/lib/font-scale'
import { Tip } from '@/components/ui/Tip'
import { Type } from 'lucide-react'

interface FontScaleToggleProps {
  className?: string
}

export default function FontScaleToggle({ className = '' }: FontScaleToggleProps) {
  const { fontScaleKey, cycleFontScale } = useFontScale()
  const label = getFontScaleLabel(fontScaleKey)

  return (
    <Tip content={`Font size: ${label} (click to cycle)`}>
      <button
        onClick={cycleFontScale}
        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg active:scale-[0.97] transition-all duration-150 ease-out hover:bg-[var(--bg-tertiary)] hover-fade ${className}`}
        aria-label={`Font size: ${label}. Click to change.`}
      >
        <Type className="w-4 h-4 text-[var(--text-secondary)]" />
        <span className="text-xs font-medium text-[var(--text-secondary)] min-w-[1.5rem]">
          {label[0]}
        </span>
      </button>
    </Tip>
  )
}
