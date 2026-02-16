import type { brands } from '~~/server/database/schema'
import { generateColorScale } from '~/utils/colorScale'
import { googleFontUrl } from '~/utils/fonts'

export type Brand = typeof brands.$inferSelect

// ─── Brand CRUD ──────────────────────────────────────────────────────────────

export function useBrands() {
  const { data, pending, error, refresh } = useFetch<Brand[]>('/api/brands')
  const defaultBrand = computed(() => data.value?.find(b => b.isDefault) ?? null)
  return { brands: data, defaultBrand, pending, error, refresh }
}

export async function setDefaultBrand(id: string) {
  return $fetch<Brand>(`/api/brands/${id}/default`, {
    method: 'POST',
  })
}

export function useBrand(id: MaybeRef<string>) {
  const resolvedId = toRef(id)
  const { data, pending, error, refresh } = useFetch<Brand>(() => `/api/brands/${resolvedId.value}`)
  return { brand: data, pending, error, refresh }
}

export async function createBrand(data: {
  name: string
  primaryColor?: string
  neutralColor?: string
  accentColor?: string
  fontFamily?: string
  fontSource?: 'google' | 'system'
  baseFontSize?: number
  typeScaleRatio?: string
  borderRadius?: string
}) {
  return $fetch<Brand>('/api/brands', {
    method: 'POST',
    body: data,
  })
}

export async function updateBrand(id: string, data: {
  name?: string
  primaryColor?: string
  neutralColor?: string
  accentColor?: string
  fontFamily?: string
  fontSource?: 'google' | 'system'
  baseFontSize?: number
  typeScaleRatio?: string
  borderRadius?: string
}) {
  return $fetch<Brand>(`/api/brands/${id}`, {
    method: 'PATCH',
    body: data,
  })
}

export async function deleteBrand(id: string) {
  return $fetch(`/api/brands/${id}`, {
    method: 'DELETE',
  })
}

// ─── Brand CSS Generation ────────────────────────────────────────────────────

/**
 * Generate a CSS string that overrides the design tokens in the preview iframe.
 * Includes color scales, typography, and shape tokens.
 */
export function generateBrandCSS(brand: Brand): string {
  const primaryScale = generateColorScale(brand.primaryColor)
  const neutralScale = generateColorScale(brand.neutralColor)
  const accentScale = generateColorScale(brand.accentColor)

  const baseFontSize = brand.baseFontSize
  const ratio = parseFloat(brand.typeScaleRatio)
  const borderRadius = brand.borderRadius

  // Generate heading sizes from base font size and type scale ratio
  // h6 = base, h5 = base * ratio, h4 = base * ratio^2, ...
  const headingSizes = Array.from({ length: 6 }, (_, i) => {
    const level = 6 - i // h1=6..h6=1 exponents → h6=ratio^0, h1=ratio^5
    const size = baseFontSize * Math.pow(ratio, level - 1)
    return `    h${7 - level} { font-size: ${size.toFixed(2)}px; }`
  }).join('\n')

  // Font family with appropriate fallback
  const fontStack = brand.fontSource === 'system'
    ? `${brand.fontFamily}, system-ui, -apple-system, sans-serif`
    : `'${brand.fontFamily}', system-ui, -apple-system, sans-serif`

  const lines: string[] = [':root {']

  // Primary color scale
  for (const [shade, hex] of Object.entries(primaryScale)) {
    lines.push(`  --ui-color-primary-${shade}: ${hex};`)
  }

  // Neutral color scale
  for (const [shade, hex] of Object.entries(neutralScale)) {
    lines.push(`  --ui-color-neutral-${shade}: ${hex};`)
  }

  // Accent color scale (additional — not in the default tokens, but useful)
  for (const [shade, hex] of Object.entries(accentScale)) {
    lines.push(`  --ui-color-accent-${shade}: ${hex};`)
  }

  // Border radius
  lines.push(`  --ui-radius: ${borderRadius}rem;`)

  lines.push('}')

  // Typography
  lines.push(`body {`)
  lines.push(`  font-family: ${fontStack};`)
  lines.push(`  font-size: ${baseFontSize}px;`)
  lines.push('}')

  // Heading sizes
  lines.push(headingSizes)

  return lines.join('\n')
}

/**
 * Get the Google Fonts link URL for a brand, or null if using a system font.
 */
export function getBrandFontLink(brand: Brand): string | null {
  if (brand.fontSource !== 'google') return null
  return googleFontUrl(brand.fontFamily)
}
