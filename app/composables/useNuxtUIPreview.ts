/**
 * Composable for managing Nuxt UI component loading in the template preview iframe.
 *
 * This handles:
 * - Loading the Nuxt UI manifest
 * - Checking if Nuxt UI build is available
 * - Parsing SFC source for component and icon usage
 * - Generating the iframe JavaScript for dynamic component loading
 */

import type { NuxtUIManifest } from '~/utils/parseNuxtUI'
import {
  parseNuxtUIComponents,
  parseIconNames,
  parseIconIdentifier,
  resolveComponentDependencies,
  getRequiredOptionalChunks,
} from '~/utils/parseNuxtUI'

interface NuxtUIPreviewState {
  /** Whether the Nuxt UI build is available */
  available: boolean
  /** Error message if build is not available */
  error: string | null
  /** The loaded manifest */
  manifest: NuxtUIManifest | null
  /** Whether the manifest is currently loading */
  loading: boolean
}

/**
 * Composable for Nuxt UI preview support.
 */
export function useNuxtUIPreview() {
  const state = useState<NuxtUIPreviewState>('nuxt-ui-preview', () => ({
    available: false,
    error: null,
    manifest: null,
    loading: false,
  }))

  /**
   * Load the Nuxt UI manifest from the server.
   * This should be called once on app startup or when first needed.
   */
  async function loadManifest(): Promise<void> {
    if (state.value.manifest || state.value.loading) return

    state.value.loading = true
    state.value.error = null

    try {
      const manifest = await $fetch<NuxtUIManifest>('/nuxt-ui/manifest.json')
      state.value.manifest = manifest
      state.value.available = true
    }
    catch (err: unknown) {
      const error = err as { statusCode?: number, data?: { hint?: string, command?: string } }
      if (error.statusCode === 503) {
        // Build not available
        state.value.error = 'Nuxt UI components not built. Run: pnpm run build:nuxt-ui'
        state.value.available = false
      }
      else {
        state.value.error = `Failed to load Nuxt UI manifest: ${err instanceof Error ? err.message : 'Unknown error'}`
        state.value.available = false
      }
    }
    finally {
      state.value.loading = false
    }
  }

  /**
   * Analyze a Vue SFC source to determine what Nuxt UI components and icons it uses.
   */
  function analyzeSFC(sfc: string): {
    components: string[]
    icons: string[]
    optionalChunks: string[]
  } {
    if (!state.value.manifest) {
      return { components: [], icons: [], optionalChunks: [] }
    }

    // Parse components used directly
    const directComponents = parseNuxtUIComponents(sfc)

    // Resolve transitive dependencies
    const allComponents = resolveComponentDependencies(directComponents, state.value.manifest)

    // Get required optional chunks
    const optionalChunks = getRequiredOptionalChunks(allComponents, state.value.manifest)

    // Parse icons
    const icons = parseIconNames(sfc)

    return { components: allComponents, icons, optionalChunks }
  }

  /**
   * Generate JavaScript code to be injected into the iframe for loading Nuxt UI components.
   * This code runs BEFORE the SFC is mounted.
   *
   * @param analysis - Output from analyzeSFC()
   * @returns JavaScript string to execute in the iframe
   */
  function generateLoaderScript(analysis: {
    components: string[]
    icons: string[]
    optionalChunks: string[]
  }): string {
    if (!analysis.components.length) {
      return '// No Nuxt UI components detected'
    }

    const componentImports = analysis.components
      .map(comp => `'${comp}'`)
      .join(', ')

    const iconFetches = analysis.icons
      .map((icon) => {
        const parsed = parseIconIdentifier(icon)
        if (!parsed) return null
        return `{ id: '${icon}', collection: '${parsed.collection}', name: '${parsed.name}' }`
      })
      .filter(Boolean)
      .join(',\n        ')

    // Script to load components and icons
    return `
      // ── Nuxt UI Component Loader ──────────────────────────────────
      (async function loadNuxtUIComponents() {
        const componentsToLoad = [${componentImports}];
        const iconsToLoad = [
          ${iconFetches}
        ];

        // Load component modules
        const modules = await Promise.all(
          componentsToLoad.map(name =>
            import('/nuxt-ui/components/' + name + '.js')
              .catch(err => {
                console.warn('Failed to load Nuxt UI component:', name, err);
                return null;
              })
          )
        );

        // Store components for registration
        window.__nuxtUIComponents = {};
        componentsToLoad.forEach((name, i) => {
          if (modules[i]?.default) {
            window.__nuxtUIComponents['U' + name] = modules[i].default;
          }
        });

        // Fetch icons from cache/API
        if (iconsToLoad.length > 0) {
          window.__nuxtUIIcons = window.__nuxtUIIcons || {};
          await Promise.all(
            iconsToLoad.map(async (iconInfo) => {
              try {
                const response = await fetch('/api/icons/' + iconInfo.collection + '/' + iconInfo.name);
                if (response.ok) {
                  const svg = await response.text();
                  window.__nuxtUIIcons[iconInfo.id] = svg;
                }
              } catch (err) {
                console.warn('Failed to load icon:', iconInfo.id, err);
              }
            })
          );
        }

        // Signal that Nuxt UI components are ready
        window.__nuxtUIReady = true;
        window.dispatchEvent(new CustomEvent('nuxt-ui-ready'));
      })();
    `
  }

  /**
   * Generate the JavaScript code for registering Nuxt UI components on a Vue app.
   * This should be called inside the mountComponent function.
   */
  function generateRegistrationScript(): string {
    return `
        // Register Nuxt UI components globally
        if (window.__nuxtUIComponents) {
          for (const [name, component] of Object.entries(window.__nuxtUIComponents)) {
            app.component(name, component);
          }
        }
    `
  }

  return {
    state: readonly(state),
    loadManifest,
    analyzeSFC,
    generateLoaderScript,
    generateRegistrationScript,
    isAvailable: computed(() => state.value.available),
    isLoading: computed(() => state.value.loading),
    error: computed(() => state.value.error),
    manifest: computed(() => state.value.manifest),
  }
}
