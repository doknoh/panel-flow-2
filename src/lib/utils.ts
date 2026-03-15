/**
 * Convert a hex color string to an rgba(...) CSS string.
 *
 * @param hex   Six-digit hex color, e.g. "#a1b2c3"
 * @param alpha Alpha channel value between 0 and 1
 */
export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
