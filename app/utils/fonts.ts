/**
 * Curated font lists for branding.
 * Google Fonts are loaded via the Google Fonts CSS API in the preview iframe.
 * System fonts are available cross-platform without network requests.
 */

export interface FontOption {
  family: string
  category: 'sans-serif' | 'serif' | 'monospace' | 'display' | 'handwriting'
  source: 'google' | 'system'
  /** Display label (defaults to family name) */
  label?: string
}

// ─── Google Fonts (curated popular subset) ───────────────────────────────────

export const GOOGLE_FONTS: FontOption[] = [
  // Sans-serif
  { family: 'Inter', category: 'sans-serif', source: 'google' },
  { family: 'Poppins', category: 'sans-serif', source: 'google' },
  { family: 'Roboto', category: 'sans-serif', source: 'google' },
  { family: 'Open Sans', category: 'sans-serif', source: 'google' },
  { family: 'Lato', category: 'sans-serif', source: 'google' },
  { family: 'Montserrat', category: 'sans-serif', source: 'google' },
  { family: 'Nunito', category: 'sans-serif', source: 'google' },
  { family: 'Nunito Sans', category: 'sans-serif', source: 'google' },
  { family: 'Raleway', category: 'sans-serif', source: 'google' },
  { family: 'Source Sans 3', category: 'sans-serif', source: 'google' },
  { family: 'DM Sans', category: 'sans-serif', source: 'google' },
  { family: 'Work Sans', category: 'sans-serif', source: 'google' },
  { family: 'Plus Jakarta Sans', category: 'sans-serif', source: 'google' },
  { family: 'Outfit', category: 'sans-serif', source: 'google' },
  { family: 'Figtree', category: 'sans-serif', source: 'google' },
  { family: 'Manrope', category: 'sans-serif', source: 'google' },
  { family: 'Lexend', category: 'sans-serif', source: 'google' },
  { family: 'Geist', category: 'sans-serif', source: 'google' },
  { family: 'Space Grotesk', category: 'sans-serif', source: 'google' },
  { family: 'Barlow', category: 'sans-serif', source: 'google' },
  { family: 'Cabin', category: 'sans-serif', source: 'google' },
  { family: 'Karla', category: 'sans-serif', source: 'google' },
  { family: 'Rubik', category: 'sans-serif', source: 'google' },
  { family: 'Quicksand', category: 'sans-serif', source: 'google' },
  { family: 'Ubuntu', category: 'sans-serif', source: 'google' },
  { family: 'Noto Sans', category: 'sans-serif', source: 'google' },
  { family: 'PT Sans', category: 'sans-serif', source: 'google' },
  { family: 'Mulish', category: 'sans-serif', source: 'google' },
  { family: 'Josefin Sans', category: 'sans-serif', source: 'google' },
  { family: 'Exo 2', category: 'sans-serif', source: 'google' },
  { family: 'IBM Plex Sans', category: 'sans-serif', source: 'google' },
  { family: 'Overpass', category: 'sans-serif', source: 'google' },
  { family: 'Archivo', category: 'sans-serif', source: 'google' },
  { family: 'Red Hat Display', category: 'sans-serif', source: 'google' },
  { family: 'Sora', category: 'sans-serif', source: 'google' },
  { family: 'Albert Sans', category: 'sans-serif', source: 'google' },

  // Serif
  { family: 'Merriweather', category: 'serif', source: 'google' },
  { family: 'Playfair Display', category: 'serif', source: 'google' },
  { family: 'Lora', category: 'serif', source: 'google' },
  { family: 'PT Serif', category: 'serif', source: 'google' },
  { family: 'Noto Serif', category: 'serif', source: 'google' },
  { family: 'Libre Baskerville', category: 'serif', source: 'google' },
  { family: 'Source Serif 4', category: 'serif', source: 'google' },
  { family: 'EB Garamond', category: 'serif', source: 'google' },
  { family: 'Crimson Text', category: 'serif', source: 'google' },
  { family: 'DM Serif Display', category: 'serif', source: 'google' },
  { family: 'Bitter', category: 'serif', source: 'google' },
  { family: 'IBM Plex Serif', category: 'serif', source: 'google' },

  // Monospace
  { family: 'JetBrains Mono', category: 'monospace', source: 'google' },
  { family: 'Fira Code', category: 'monospace', source: 'google' },
  { family: 'Source Code Pro', category: 'monospace', source: 'google' },
  { family: 'IBM Plex Mono', category: 'monospace', source: 'google' },
  { family: 'Roboto Mono', category: 'monospace', source: 'google' },
  { family: 'Space Mono', category: 'monospace', source: 'google' },

  // Display
  { family: 'Bebas Neue', category: 'display', source: 'google' },
  { family: 'Oswald', category: 'display', source: 'google' },
  { family: 'Anton', category: 'display', source: 'google' },
  { family: 'Righteous', category: 'display', source: 'google' },
  { family: 'Abril Fatface', category: 'display', source: 'google' },
  { family: 'Fredoka', category: 'display', source: 'google' },
  { family: 'Titan One', category: 'display', source: 'google' },
]

// ─── System Fonts (cross-platform) ──────────────────────────────────────────

export const SYSTEM_FONTS: FontOption[] = [
  { family: 'system-ui', category: 'sans-serif', source: 'system', label: 'System Default' },
  { family: 'Arial', category: 'sans-serif', source: 'system' },
  { family: 'Helvetica', category: 'sans-serif', source: 'system' },
  { family: 'Verdana', category: 'sans-serif', source: 'system' },
  { family: 'Trebuchet MS', category: 'sans-serif', source: 'system' },
  { family: 'Georgia', category: 'serif', source: 'system' },
  { family: 'Times New Roman', category: 'serif', source: 'system' },
  { family: 'Palatino', category: 'serif', source: 'system' },
  { family: 'Courier New', category: 'monospace', source: 'system' },
]

/** All fonts combined, Google first then system. */
export const ALL_FONTS: FontOption[] = [...GOOGLE_FONTS, ...SYSTEM_FONTS]

/**
 * Build a Google Fonts CSS API URL for loading a font with common weights.
 */
export function googleFontUrl(family: string): string {
  const encoded = family.replace(/ /g, '+')
  return `https://fonts.googleapis.com/css2?family=${encoded}:wght@300;400;500;600;700;800;900&display=swap`
}

/** Named type scale ratio presets. */
export const TYPE_SCALE_PRESETS = [
  { label: 'Minor Second (1.067)', value: '1.067' },
  { label: 'Major Second (1.125)', value: '1.125' },
  { label: 'Minor Third (1.200)', value: '1.200' },
  { label: 'Major Third (1.250)', value: '1.250' },
  { label: 'Perfect Fourth (1.333)', value: '1.333' },
  { label: 'Augmented Fourth (1.414)', value: '1.414' },
  { label: 'Perfect Fifth (1.500)', value: '1.500' },
  { label: 'Golden Ratio (1.618)', value: '1.618' },
] as const

/** Named border radius presets. */
export const BORDER_RADIUS_PRESETS = [
  { label: 'None (0)', value: '0' },
  { label: 'Subtle (0.125rem)', value: '0.125' },
  { label: 'Small (0.25rem)', value: '0.25' },
  { label: 'Default (0.325rem)', value: '0.325' },
  { label: 'Medium (0.5rem)', value: '0.5' },
  { label: 'Large (0.75rem)', value: '0.75' },
  { label: 'Extra Large (1rem)', value: '1' },
] as const
