#!/usr/bin/env npx tsx

/**
 * Builds all Nuxt UI components into standalone ES modules for use in the
 * template preview iframe.
 *
 * Outputs to: resources/nuxt-ui/
 *   - shared.js         — Common runtime dependencies (reka-ui, tailwind-variants, etc.)
 *   - components/*.js   — Individual component modules
 *   - optional/         — Heavy optional dependencies (TipTap, TanStack, Embla, Vaul)
 *   - style.css         — All component styles
 *   - manifest.json     — Component metadata and dependency graph
 *   - version.txt       — @nuxt/ui version for staleness detection
 *
 * Usage: pnpm run build:nuxt-ui
 */

import { build } from 'vite'
import type { Plugin, PluginOption } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUTPUT_DIR = join(ROOT, 'resources/nuxt-ui')
const NUXT_UI_PATH = join(ROOT, 'node_modules/@nuxt/ui')
const COMPONENTS_PATH = join(NUXT_UI_PATH, 'dist/runtime/components')

// ─── Configuration ───────────────────────────────────────────────────────────

/**
 * Components that require heavy optional dependencies.
 * These will be built into separate chunks that are only loaded when needed.
 */
const OPTIONAL_CHUNKS: Record<string, string[]> = {
  // TipTap (rich text editor) - ~200KB
  'editor': [
    'Editor',
    'EditorDragHandle',
    'EditorEmojiMenu',
    'EditorMentionMenu',
    'EditorSuggestionMenu',
    'EditorToolbar',
  ],
  // TanStack (data table + virtual scroll) - ~100KB
  'table': ['Table'],
  // Embla (carousel) - ~50KB
  'carousel': ['Carousel'],
  // Vaul (drawer) - ~20KB
  'drawer': ['Drawer'],
}

// Invert the map for quick lookup: component name -> chunk name
const COMPONENT_TO_CHUNK: Record<string, string> = {}
for (const [chunk, components] of Object.entries(OPTIONAL_CHUNKS)) {
  for (const comp of components) {
    COMPONENT_TO_CHUNK[comp] = chunk
  }
}

/**
 * Shared dependencies that should be bundled into a common chunk.
 * All components will import from this shared chunk.
 */
const SHARED_DEPS = [
  'reka-ui',
  'tailwind-variants',
  '@vueuse/core',
  '@vueuse/shared',
  'defu',
  'ohash',
  'tailwind-merge',
  '@floating-ui/dom',
  '@floating-ui/vue',
  '@iconify/vue',
  '@internationalized/date',
  '@internationalized/number',
  'fuse.js',
  'motion-v',
  'colortranslator',
]

/**
 * Heavy dependencies that should only be included in optional chunks.
 */
const OPTIONAL_DEPS: Record<string, string[]> = {
  'editor': [
    '@tiptap/core',
    '@tiptap/pm',
    '@tiptap/vue-3',
    '@tiptap/starter-kit',
    '@tiptap/extension-bubble-menu',
    '@tiptap/extension-code',
    '@tiptap/extension-collaboration',
    '@tiptap/extension-drag-handle',
    '@tiptap/extension-drag-handle-vue-3',
    '@tiptap/extension-floating-menu',
    '@tiptap/extension-horizontal-rule',
    '@tiptap/extension-image',
    '@tiptap/extension-mention',
    '@tiptap/extension-node-range',
    '@tiptap/extension-placeholder',
    '@tiptap/markdown',
    '@tiptap/suggestion',
  ],
  'table': [
    '@tanstack/vue-table',
    '@tanstack/vue-virtual',
  ],
  'carousel': [
    'embla-carousel-vue',
    'embla-carousel-auto-height',
    'embla-carousel-auto-scroll',
    'embla-carousel-autoplay',
    'embla-carousel-class-names',
    'embla-carousel-fade',
    'embla-carousel-wheel-gestures',
  ],
  'drawer': [
    'vaul-vue',
  ],
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getComponentFiles(): string[] {
  const files = readdirSync(COMPONENTS_PATH)
    .filter(f => f.endsWith('.vue'))
    .map(f => basename(f, '.vue'))
    .sort()
  return files
}

function getNuxtUIVersion(): string {
  const pkgPath = join(NUXT_UI_PATH, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
  return pkg.version
}

/**
 * Generate temporary entry files on disk for the build.
 * Each component gets its own entry that re-exports the component.
 * Returns path to temp directory and entries object.
 */
function generateEntries(components: string[]): { tempDir: string, entries: Record<string, string> } {
  const tempDir = join(ROOT, '.nuxt-ui-build')
  mkdirSync(tempDir, { recursive: true })

  const entries: Record<string, string> = {}

  for (const comp of components) {
    const entryPath = join(tempDir, `${comp}.ts`)
    const entryContent = `export { default } from '@nuxt/ui/components/${comp}.vue'\n`
    writeFileSync(entryPath, entryContent)
    entries[`components/${comp}`] = entryPath
  }

  return { tempDir, entries }
}

/**
 * Analyze component dependencies by parsing imports.
 * This is a simplified version - the actual dependency graph is built by
 * Nuxt UI's own utilities, but we'll approximate it here.
 */
async function analyzeComponentDependencies(components: string[]): Promise<Record<string, string[]>> {
  const deps: Record<string, string[]> = {}

  for (const comp of components) {
    const filePath = join(COMPONENTS_PATH, `${comp}.vue`)
    try {
      const content = readFileSync(filePath, 'utf-8')

      // Find imports of other components (e.g., import UIcon from './Icon.vue')
      // or usage in template (e.g., <UIcon, <Icon)
      const componentDeps = new Set<string>()

      // Match relative imports of .vue files
      const importMatches = content.matchAll(/from\s+['"]\.\/([\w-]+)\.vue['"]/g)
      for (const match of importMatches) {
        const depName = match[1]
        if (depName && depName !== comp && components.includes(depName)) {
          componentDeps.add(depName)
        }
      }

      // Match component usage in template (U-prefixed or plain)
      const templateMatches = content.matchAll(/<(U?[A-Z][a-zA-Z]+)(?:\s|\/|>)/g)
      for (const match of templateMatches) {
        let depName = match[1]!
        // Remove U prefix if present
        if (depName.startsWith('U') && depName.length > 1 && depName[1] === depName[1]!.toUpperCase()) {
          depName = depName.slice(1)
        }
        if (depName !== comp && components.includes(depName)) {
          componentDeps.add(depName)
        }
      }

      deps[comp] = [...componentDeps].sort()
    }
    catch {
      deps[comp] = []
    }
  }

  return deps
}

/**
 * Parse internal icons used by Nuxt UI components.
 */
function parseInternalIcons(): string[] {
  // These are defined in @nuxt/ui/dist/shared/ui.*.mjs
  return [
    'i-lucide-arrow-down',
    'i-lucide-arrow-left',
    'i-lucide-arrow-right',
    'i-lucide-arrow-up',
    'i-lucide-circle-alert',
    'i-lucide-check',
    'i-lucide-chevrons-left',
    'i-lucide-chevrons-right',
    'i-lucide-chevron-down',
    'i-lucide-chevron-left',
    'i-lucide-chevron-right',
    'i-lucide-chevron-up',
    'i-lucide-x',
    'i-lucide-copy',
    'i-lucide-copy-check',
    'i-lucide-moon',
    'i-lucide-grip-vertical',
    'i-lucide-ellipsis',
    'i-lucide-circle-x',
    'i-lucide-arrow-up-right',
    'i-lucide-eye',
    'i-lucide-eye-off',
    'i-lucide-file',
    'i-lucide-folder',
    'i-lucide-folder-open',
    'i-lucide-hash',
    'i-lucide-info',
    'i-lucide-sun',
    'i-lucide-loader-circle',
    'i-lucide-menu',
    'i-lucide-minus',
    'i-lucide-panel-left-close',
    'i-lucide-panel-left-open',
    'i-lucide-plus',
    'i-lucide-rotate-ccw',
    'i-lucide-search',
    'i-lucide-square',
    'i-lucide-circle-check',
    'i-lucide-monitor',
    'i-lucide-lightbulb',
    'i-lucide-upload',
    'i-lucide-triangle-alert',
  ]
}

/**
 * Generate the manifest.json file.
 */
function generateManifest(
  components: string[],
  deps: Record<string, string[]>,
  version: string,
): object {
  const componentManifest: Record<string, { file: string, deps: string[], optionalChunk: string | null }> = {}

  for (const comp of components) {
    componentManifest[comp] = {
      file: `components/${comp}.js`,
      deps: deps[comp] || [],
      optionalChunk: COMPONENT_TO_CHUNK[comp] || null,
    }
  }

  return {
    version,
    generatedAt: new Date().toISOString(),
    components: componentManifest,
    optionalChunks: Object.keys(OPTIONAL_CHUNKS),
    icons: {
      internal: parseInternalIcons(),
    },
  }
}

// ─── Main Build ──────────────────────────────────────────────────────────────

async function main() {
  console.log('Building Nuxt UI components for template preview...\n')

  // Ensure output directory exists
  mkdirSync(OUTPUT_DIR, { recursive: true })
  mkdirSync(join(OUTPUT_DIR, 'components'), { recursive: true })
  mkdirSync(join(OUTPUT_DIR, 'optional'), { recursive: true })

  // Get component list and version
  const components = getComponentFiles()
  const version = getNuxtUIVersion()

  console.log(`Found ${components.length} components in @nuxt/ui v${version}`)
  console.log()

  // Analyze dependencies
  console.log('Analyzing component dependencies...')
  const deps = await analyzeComponentDependencies(components)

  // Import @nuxt/ui/vite plugin dynamically
  console.log('Loading @nuxt/ui/vite plugin...')
  const nuxtUIVite = await import('@nuxt/ui/vite').then(m => m.default)

  // Generate entries
  const { tempDir, entries } = generateEntries(components)

  // Build configuration
  console.log('Starting Vite build...\n')

  // Create a map of all optional deps for exclusion from main build
  const allOptionalDeps = Object.values(OPTIONAL_DEPS).flat()

  try {
    await build({
      root: ROOT,
      configFile: false,
      logLevel: 'info',

      plugins: [
        vue(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (nuxtUIVite as any)({
          // Disable features we don't need
          colorMode: true,
          fonts: false,
        }),
      ],

      build: {
        outDir: OUTPUT_DIR,
        emptyOutDir: false, // Don't delete manifest etc.
        lib: {
          entry: entries,
          formats: ['es'],
        },
      rollupOptions: {
        external: [
          'vue',
          // Externalize optional heavy deps - they'll be in separate chunks
          ...allOptionalDeps,
        ],
        output: {
          // Remap external imports to URLs that work in the browser
          // Vue uses our shim, optional deps use esm.sh with external vue
          paths: {
            vue: '/nuxt-ui/vue.js',
            // Optional heavy dependencies - loaded from esm.sh
            // We DON'T use ?external=vue because import maps don't apply to cross-origin modules.
            // Instead, let esm.sh bundle Vue - the duplication is acceptable for these optional deps.
            '@tanstack/vue-virtual': 'https://esm.sh/@tanstack/vue-virtual@3',
            '@tiptap/vue-3': 'https://esm.sh/@tiptap/vue-3@2',
            '@tiptap/suggestion': 'https://esm.sh/@tiptap/suggestion@2',
          },
          // Preserve module structure
          preserveModules: false,
          // Control chunking
          manualChunks(id) {
            // Vue is external
            if (id.includes('node_modules/vue/')) {
              return undefined // external
            }

            // Shared dependencies go into shared chunk
            for (const dep of SHARED_DEPS) {
              if (id.includes(`node_modules/${dep}/`) || id.includes(`node_modules/${dep.replace('/', '+')}/`)) {
                return 'shared'
              }
            }

            // Optional deps handled separately (externalized for main build)
            for (const dep of allOptionalDeps) {
              if (id.includes(`node_modules/${dep}/`)) {
                return undefined // external
              }
            }

            // Nuxt UI internal utilities go into shared
            if (id.includes('@nuxt/ui/dist/runtime/utils') ||
                id.includes('@nuxt/ui/dist/runtime/composables') ||
                id.includes('@nuxt/ui/dist/runtime/vue')) {
              return 'shared'
            }

            // Everything else (components) stays in its own chunk
            return undefined
          },
          // File naming
          entryFileNames: '[name].js',
          chunkFileNames: '[name].js',
          assetFileNames: '[name][extname]',
        },
      },
      cssCodeSplit: false, // Single CSS file
      minify: 'esbuild',
      sourcemap: false,
    },

    // Suppress Tailwind CSS warnings about config
    css: {
      postcss: {
        plugins: [],
      },
    },
  })
  }
  finally {
    // Clean up temp directory
    const { rmSync } = await import('node:fs')
    rmSync(tempDir, { recursive: true, force: true })
  }

  // Write Vue shim that re-exports from global Vue
  // This allows ES module imports like `import { ref } from 'vue'` to work
  // when Vue is loaded as a global script in the iframe
  console.log('\nGenerating vue.js shim...')
  const vueShim = `// Vue ESM shim - re-exports from global Vue loaded via <script>
const Vue = window.Vue;
export default Vue;
export const {
  // Reactivity
  ref, reactive, readonly, computed, watch, watchEffect, watchPostEffect, watchSyncEffect,
  isRef, unref, toRef, toRefs, toValue, isReactive, isReadonly, isProxy,
  shallowRef, triggerRef, customRef, shallowReactive, shallowReadonly, markRaw, toRaw,
  // Lifecycle
  onMounted, onUpdated, onUnmounted, onBeforeMount, onBeforeUpdate, onBeforeUnmount,
  onActivated, onDeactivated, onErrorCaptured, onRenderTracked, onRenderTriggered,
  onScopeDispose,
  // Component
  defineComponent, defineAsyncComponent, getCurrentInstance, h, createVNode, cloneVNode, mergeProps,
  isVNode, resolveComponent, resolveDirective, resolveDynamicComponent,
  // Provide/Inject
  provide, inject, hasInjectionContext,
  // Slots
  useSlots, useAttrs,
  // Custom Elements
  defineCustomElement, useCssModule, useCssVars,
  // Suspense
  onServerPrefetch,
  // App
  createApp, createSSRApp, nextTick, version,
  // Directives
  withDirectives, vShow,
  // Teleport/Transition
  Teleport, Transition, TransitionGroup, KeepAlive, Suspense, Fragment, Text, Comment, Static,
  // Effects
  effect, effectScope, getCurrentScope,
  // Render helpers
  openBlock, createBlock, createElementBlock, createElementVNode, createTextVNode, createCommentVNode,
  createSlots,
  withCtx, renderSlot, renderList, normalizeClass, normalizeStyle, normalizeProps, guardReactiveProps,
  toHandlers, toHandlerKey, withModifiers, withKeys, withMemo,
  // SSR
  ssrContextKey, useSSRContext,
  // Misc
  camelize, capitalize, toDisplayString,
  // Vue 3.3+ APIs
  mergeDefaults, mergeModels, useModel, useId, useTemplateRef,
} = Vue;
`
  writeFileSync(join(OUTPUT_DIR, 'vue.js'), vueShim)

  // Write manifest
  console.log('Generating manifest.json...')
  const manifest = generateManifest(components, deps, version)
  writeFileSync(
    join(OUTPUT_DIR, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
  )

  // Write version file
  writeFileSync(join(OUTPUT_DIR, 'version.txt'), version)

  console.log(`\nBuild complete! Output: ${OUTPUT_DIR}`)
  console.log(`  - ${components.length} components`)
  console.log(`  - Version: ${version}`)
}

main().catch((err) => {
  console.error('Build failed:', err)
  process.exit(1)
})
