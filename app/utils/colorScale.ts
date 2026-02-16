/**
 * Generate an 11-shade color scale (50–950) from a single hex color.
 *
 * The input hex is treated as the 500 shade. The algorithm:
 * 1. Extracts hue and saturation from the input color
 * 2. Maps each shade to a fixed target lightness (matching Tailwind's scale distribution)
 * 3. Aggressively desaturates lighter shades so they remain neutral/subtle
 * 4. Slightly boosts saturation for mid-dark shades (600-800) for vibrancy
 *
 * The desaturation curve is critical for contrast — light shades (50-200) need
 * to be nearly achromatic so they work as backgrounds, while dark shades
 * (800-950) need enough saturation to retain the color's character.
 */

/**
 * Shade keys mapped to [targetLightness, saturationMultiplier].
 *
 * The saturation multipliers are calibrated to match how Tailwind's hand-tuned
 * scales work: very light shades are nearly gray, the 500 shade preserves the
 * original saturation, and dark shades retain moderate saturation.
 */
const SHADE_MAP: Array<[string, number, number]> = [
  //           lightness  sat multiplier
  ['50', 0.97, 0.08], // almost white, barely tinted
  ['100', 0.94, 0.12], // very light, subtle tint
  ['200', 0.88, 0.22], // light, gentle tint
  ['300', 0.78, 0.40], // medium-light, noticeable color
  ['400', 0.64, 0.70], // approaching the base, clear color
  ['500', 0.50, 1.00], // base — full original saturation
  ['600', 0.40, 1.05], // slightly richer than base
  ['700', 0.31, 1.00], // dark, retains color character
  ['800', 0.22, 0.90], // very dark, slightly less saturated
  ['900', 0.13, 0.80], // near-black, moderate saturation
  ['950', 0.06, 0.70], // deepest, subtle color
]

function hexToHSL(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2

  if (max === min) return [0, 0, l]

  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

  let h = 0
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6

  return [h * 360, s, l]
}

function hslToHex(h: number, s: number, l: number): string {
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }

  h = h / 360
  let r: number, g: number, b: number

  if (s === 0) {
    r = g = b = l
  }
  else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hue2rgb(p, q, h + 1 / 3)
    g = hue2rgb(p, q, h)
    b = hue2rgb(p, q, h - 1 / 3)
  }

  const toHex = (v: number) => {
    const hex = Math.round(Math.min(255, Math.max(0, v * 255))).toString(16)
    return hex.length === 1 ? '0' + hex : hex
  }

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

/**
 * Generate a full color scale from a single hex color.
 * Returns an object with keys '50', '100', ..., '950' mapped to hex strings.
 */
export function generateColorScale(hex: string): Record<string, string> {
  const [h, s] = hexToHSL(hex)
  const scale: Record<string, string> = {}

  for (const [shade, targetL, satMul] of SHADE_MAP) {
    const adjustedSat = Math.min(1, s * satMul)
    scale[shade] = hslToHex(h, adjustedSat, targetL)
  }

  return scale
}
