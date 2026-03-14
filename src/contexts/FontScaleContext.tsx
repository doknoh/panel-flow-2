'use client'

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import {
  FontScaleKey,
  FONT_SCALE_PRESETS,
  DEFAULT_FONT_SCALE,
  FONT_SCALE_STORAGE_KEY,
  getNextFontScale,
} from '@/lib/font-scale'

interface FontScaleContextType {
  fontScaleKey: FontScaleKey
  setFontScale: (key: FontScaleKey) => void
  cycleFontScale: () => void
}

const FontScaleContext = createContext<FontScaleContextType | undefined>(undefined)

function applyFontScale(key: FontScaleKey) {
  document.documentElement.style.setProperty('--font-scale', String(FONT_SCALE_PRESETS[key]))
}

export function FontScaleProvider({ children }: { children: ReactNode }) {
  const [fontScaleKey, setFontScaleKey] = useState<FontScaleKey>(DEFAULT_FONT_SCALE)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(FONT_SCALE_STORAGE_KEY) as FontScaleKey | null
    const initial = stored && stored in FONT_SCALE_PRESETS ? stored : DEFAULT_FONT_SCALE
    setFontScaleKey(initial)
    applyFontScale(initial)
    setMounted(true)
  }, [])

  const setFontScale = useCallback((key: FontScaleKey) => {
    setFontScaleKey(key)
    localStorage.setItem(FONT_SCALE_STORAGE_KEY, key)
    applyFontScale(key)
  }, [])

  const cycleFontScale = useCallback(() => {
    setFontScale(getNextFontScale(fontScaleKey))
  }, [fontScaleKey, setFontScale])

  return (
    <FontScaleContext.Provider value={{ fontScaleKey, setFontScale, cycleFontScale }}>
      {mounted ? children : <div style={{ visibility: 'hidden' }}>{children}</div>}
    </FontScaleContext.Provider>
  )
}

export function useFontScale() {
  const context = useContext(FontScaleContext)
  if (context === undefined) {
    throw new Error('useFontScale must be used within a FontScaleProvider')
  }
  return context
}
