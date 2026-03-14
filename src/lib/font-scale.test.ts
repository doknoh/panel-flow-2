import { describe, it, expect } from 'vitest'
import {
  FONT_SCALE_PRESETS,
  FontScaleKey,
  getNextFontScale,
  getFontScaleLabel,
  FONT_SCALE_STORAGE_KEY,
  DEFAULT_FONT_SCALE,
} from './font-scale'

describe('font-scale', () => {
  it('has three presets: small, medium, large', () => {
    expect(Object.keys(FONT_SCALE_PRESETS)).toEqual(['small', 'medium', 'large'])
  })

  it('small preset is 1.0 (current default)', () => {
    expect(FONT_SCALE_PRESETS.small).toBe(1.0)
  })

  it('medium preset is 1.15', () => {
    expect(FONT_SCALE_PRESETS.medium).toBe(1.15)
  })

  it('large preset is 1.3', () => {
    expect(FONT_SCALE_PRESETS.large).toBe(1.3)
  })

  it('default font scale is small', () => {
    expect(DEFAULT_FONT_SCALE).toBe('small')
  })

  it('cycles through presets: small → medium → large → small', () => {
    expect(getNextFontScale('small')).toBe('medium')
    expect(getNextFontScale('medium')).toBe('large')
    expect(getNextFontScale('large')).toBe('small')
  })

  it('returns human-readable labels', () => {
    expect(getFontScaleLabel('small')).toBe('Small')
    expect(getFontScaleLabel('medium')).toBe('Medium')
    expect(getFontScaleLabel('large')).toBe('Large')
  })

  it('storage key is panel-flow-font-scale', () => {
    expect(FONT_SCALE_STORAGE_KEY).toBe('panel-flow-font-scale')
  })
})
