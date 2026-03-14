export type FontScaleKey = 'small' | 'medium' | 'large'

export const FONT_SCALE_PRESETS: Record<FontScaleKey, number> = {
  small: 1.0,
  medium: 1.15,
  large: 1.3,
}

export const DEFAULT_FONT_SCALE: FontScaleKey = 'small'
export const FONT_SCALE_STORAGE_KEY = 'panel-flow-font-scale'

const SCALE_ORDER: FontScaleKey[] = ['small', 'medium', 'large']

export function getNextFontScale(current: FontScaleKey): FontScaleKey {
  const idx = SCALE_ORDER.indexOf(current)
  return SCALE_ORDER[(idx + 1) % SCALE_ORDER.length]
}

export function getFontScaleLabel(key: FontScaleKey): string {
  return key.charAt(0).toUpperCase() + key.slice(1)
}
