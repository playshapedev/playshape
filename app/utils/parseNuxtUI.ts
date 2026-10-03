/**
 * Utilities for parsing Nuxt UI component and icon usage from Vue SFC source code.
 * Used by TemplatePreview to determine which components and icons to load dynamically.
 */

/**
 * Parse Nuxt UI component names from a Vue SFC source string.
 * Detects both PascalCase (<UButton>) and kebab-case (<u-button>) usage.
 *
 * @param sfc - Vue SFC source code
 * @returns Array of component names in PascalCase without the 'U' prefix (e.g., ['Button', 'Card'])
 */
export function parseNuxtUIComponents(sfc: string): string[] {
  const components = new Set<string>()

  // Match PascalCase: <UButton, <UCard, etc.
  // Captures the component name after 'U'
  const pascalMatches = sfc.matchAll(/<U([A-Z][a-zA-Z]*)/g)
  for (const match of pascalMatches) {
    if (match[1]) {
      components.add(match[1])
    }
  }

  // Match kebab-case: <u-button, <u-card, etc.
  // Converts to PascalCase
  const kebabMatches = sfc.matchAll(/<u-([a-z][a-z-]*)/g)
  for (const match of kebabMatches) {
    if (match[1]) {
      // Convert kebab-case to PascalCase: 'avatar-group' -> 'AvatarGroup'
      const pascalName = match[1]
        .split('-')
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join('')
      components.add(pascalName)
    }
  }

  // Also check for dynamic component usage: :is="UButton" or is="UButton"
  const dynamicMatches = sfc.matchAll(/:?is=["']U([A-Z][a-zA-Z]*)["']/g)
  for (const match of dynamicMatches) {
    if (match[1]) {
      components.add(match[1])
    }
  }

  return [...components].sort()
}

/**
 * Parse icon names from a Vue SFC source string.
 * Detects icons used in:
 *   - <UIcon name="i-lucide-check" />
 *   - icon="i-heroicons-star" prop on any component
 *   - :icon="'i-lucide-check'" dynamic binding
 *   - leading-icon, trailing-icon props
 *
 * @param sfc - Vue SFC source code
 * @returns Array of icon identifiers (e.g., ['i-lucide-check', 'i-heroicons-star'])
 */
export function parseIconNames(sfc: string): string[] {
  const icons = new Set<string>()

  // Match name="i-*" (UIcon component)
  const nameMatches = sfc.matchAll(/name=["'](i-[a-z0-9-]+)["']/gi)
  for (const match of nameMatches) {
    if (match[1]) {
      icons.add(match[1].toLowerCase())
    }
  }

  // Match icon="i-*" prop
  const iconMatches = sfc.matchAll(/(?<![\w-])icon=["'](i-[a-z0-9-]+)["']/gi)
  for (const match of iconMatches) {
    if (match[1]) {
      icons.add(match[1].toLowerCase())
    }
  }

  // Match :icon="'i-*'" dynamic binding
  const dynamicIconMatches = sfc.matchAll(/:icon=["']'(i-[a-z0-9-]+)'["']/gi)
  for (const match of dynamicIconMatches) {
    if (match[1]) {
      icons.add(match[1].toLowerCase())
    }
  }

  // Match leading-icon="i-*" and trailing-icon="i-*"
  const leadingTrailingMatches = sfc.matchAll(/(?:leading|trailing)-icon=["'](i-[a-z0-9-]+)["']/gi)
  for (const match of leadingTrailingMatches) {
    if (match[1]) {
      icons.add(match[1].toLowerCase())
    }
  }

  // Match loading-icon="i-*"
  const loadingMatches = sfc.matchAll(/loading-icon=["'](i-[a-z0-9-]+)["']/gi)
  for (const match of loadingMatches) {
    if (match[1]) {
      icons.add(match[1].toLowerCase())
    }
  }

  return [...icons].sort()
}

/**
 * Parse an icon identifier into its collection and name parts.
 * Icon format: i-{collection}-{name} (e.g., i-lucide-check, i-heroicons-star)
 *
 * @param icon - Icon identifier string
 * @returns Object with collection and name, or null if invalid format
 */
export function parseIconIdentifier(icon: string): { collection: string, name: string } | null {
  // Format: i-{collection}-{name}
  // Examples:
  //   i-lucide-check -> { collection: 'lucide', name: 'check' }
  //   i-heroicons-outline-star -> { collection: 'heroicons-outline', name: 'star' }
  //   i-simple-icons-github -> { collection: 'simple-icons', name: 'github' }

  if (!icon.startsWith('i-')) {
    return null
  }

  const withoutPrefix = icon.slice(2) // Remove 'i-'

  // Known icon collection prefixes (order matters - check longer prefixes first)
  const knownCollections = [
    'heroicons-outline',
    'heroicons-solid',
    'heroicons',
    'simple-icons',
    'lucide',
    'mdi',
    'ph', // Phosphor
    'tabler',
    'carbon',
    'bi', // Bootstrap Icons
    'fa6-solid',
    'fa6-regular',
    'fa6-brands',
    'ri', // Remix Icons
    'ion',
    'uil', // Unicons
    'bx', // BoxIcons
    'feather',
    'octicon',
    'radix-icons',
  ]

  for (const collection of knownCollections) {
    if (withoutPrefix.startsWith(collection + '-')) {
      const name = withoutPrefix.slice(collection.length + 1)
      return { collection, name }
    }
  }

  // Fallback: assume first segment is collection, rest is name
  const firstDash = withoutPrefix.indexOf('-')
  if (firstDash === -1) {
    return null
  }

  return {
    collection: withoutPrefix.slice(0, firstDash),
    name: withoutPrefix.slice(firstDash + 1),
  }
}

/**
 * Resolve component dependencies from the manifest.
 * Given a list of directly used components, returns all components needed
 * including transitive dependencies.
 *
 * @param components - Array of directly used component names
 * @param manifest - The nuxt-ui manifest object
 * @returns Array of all component names needed (including dependencies)
 */
export function resolveComponentDependencies(
  components: string[],
  manifest: NuxtUIManifest,
): string[] {
  const resolved = new Set<string>()
  const queue = [...components]

  while (queue.length > 0) {
    const comp = queue.shift()!
    if (resolved.has(comp)) continue

    const info = manifest.components[comp]
    if (!info) {
      // Unknown component - might be user-defined, skip
      continue
    }

    resolved.add(comp)

    // Add dependencies to queue
    for (const dep of info.deps) {
      if (!resolved.has(dep)) {
        queue.push(dep)
      }
    }
  }

  return [...resolved].sort()
}

/**
 * Get the optional chunks needed for a set of components.
 *
 * @param components - Array of component names
 * @param manifest - The nuxt-ui manifest object
 * @returns Array of optional chunk paths that need to be loaded
 */
export function getRequiredOptionalChunks(
  components: string[],
  manifest: NuxtUIManifest,
): string[] {
  const chunks = new Set<string>()

  for (const comp of components) {
    const info = manifest.components[comp]
    if (info?.optionalChunk) {
      chunks.add(info.optionalChunk)
    }
  }

  return [...chunks].sort()
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface NuxtUIManifest {
  version: string
  generatedAt: string
  components: Record<string, {
    file: string
    deps: string[]
    optionalChunk: string | null
  }>
  optionalChunks: string[]
  icons: {
    internal: string[]
  }
}
