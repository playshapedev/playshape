<script setup lang="ts">
import { marked } from 'marked'
import type { Brand } from '~/composables/useBrands'
import {
  parseNuxtUIComponents,
  parseIconNames,
  parseIconIdentifier,
  resolveComponentDependencies,
  getRequiredOptionalChunks,
  type NuxtUIManifest,
} from '~/utils/parseNuxtUI'

interface Dependency {
  name: string
  url: string
  global: string
}

interface InputField {
  id: string
  type: string
  label: string
  fields?: InputField[]
}

interface SlotContent {
  sfc: string
  data: Record<string, unknown>
  dependencies?: Dependency[]
  inputSchema?: InputField[]
  name?: string
}

const props = defineProps<{
  componentSource: string
  data: Record<string, unknown>
  dependencies?: Dependency[]
  tools?: string[]
  /** Input schema for the template - used to identify textarea fields for markdown processing */
  inputSchema?: InputField[]
  /** When provided, the component is treated as a wrapper — slotContent is rendered inside <slot name="activity"> */
  slotContent?: SlotContent | null
  /** When provided, overrides the design tokens in the preview iframe */
  brand?: Brand | null
}>()

// ─── Markdown Processing ─────────────────────────────────────────────────────

/**
 * Recursively process data, converting markdown to HTML for textarea fields.
 * Handles nested objects and arrays based on the input schema.
 */
function processMarkdownFields(
  data: Record<string, unknown>,
  schema: InputField[] | undefined,
): Record<string, unknown> {
  if (!schema || !data) return data

  const result = { ...data }

  for (const field of schema) {
    const value = result[field.id]

    if (field.type === 'textarea' && typeof value === 'string' && value.trim()) {
      // Convert markdown to HTML
      result[field.id] = marked.parse(value, { async: false }) as string
    }
    else if (field.type === 'array' && Array.isArray(value) && field.fields) {
      // Recursively process array items
      result[field.id] = value.map(item =>
        typeof item === 'object' && item !== null
          ? processMarkdownFields(item as Record<string, unknown>, field.fields)
          : item,
      )
    }
  }

  return result
}

/**
 * Process the main data with markdown conversion for textarea fields.
 */
const processedData = computed(() => {
  return processMarkdownFields(props.data, props.inputSchema)
})

/**
 * Process slot content data with markdown conversion.
 */
const processedSlotData = computed(() => {
  if (!props.slotContent?.data) return null
  return processMarkdownFields(props.slotContent.data, props.slotContent.inputSchema)
})

const emit = defineEmits<{
  error: [message: string | null]
}>()

const { getTools } = useActivityTools()

// ─── Nuxt UI Components ──────────────────────────────────────────────────────

const nuxtUIManifest = ref<NuxtUIManifest | null>(null)
const nuxtUIAvailable = ref(false)
const nuxtUIError = ref<string | null>(null)

// Load Nuxt UI manifest on mount
onMounted(async () => {
  try {
    const manifest = await $fetch<NuxtUIManifest>('/nuxt-ui/manifest.json')
    nuxtUIManifest.value = manifest
    nuxtUIAvailable.value = true
    console.log('[NuxtUI Debug] Manifest loaded successfully:', {
      componentCount: Object.keys(manifest.components).length,
      components: Object.keys(manifest.components).slice(0, 10).join(', ') + '...',
    })
  }
  catch (err: unknown) {
    const error = err as { statusCode?: number }
    if (error.statusCode === 503) {
      nuxtUIError.value = 'Nuxt UI components not built. Run: pnpm run build:nuxt-ui'
    }
    else {
      // Non-critical - components just won't be available
      console.warn('Nuxt UI manifest not available:', err)
    }
    nuxtUIAvailable.value = false
    console.log('[NuxtUI Debug] Manifest failed to load, nuxtUIAvailable =', nuxtUIAvailable.value)
  }
})

/**
 * Analyze a Vue SFC to determine which Nuxt UI components and icons it uses.
 */
function analyzeNuxtUIUsage(sfc: string): {
  components: string[]
  icons: Array<{ id: string, collection: string, name: string }>
  optionalChunks: string[]
} {
  if (!nuxtUIManifest.value) {
    return { components: [], icons: [], optionalChunks: [] }
  }

  // Parse components directly used
  const directComponents = parseNuxtUIComponents(sfc)

  // Resolve transitive dependencies
  const allComponents = resolveComponentDependencies(directComponents, nuxtUIManifest.value)

  // Get required optional chunks
  const optionalChunks = getRequiredOptionalChunks(allComponents, nuxtUIManifest.value)

  // Parse icons
  const iconIds = parseIconNames(sfc)
  const icons = iconIds
    .map((id) => {
      const parsed = parseIconIdentifier(id)
      if (!parsed) return null
      return { id, collection: parsed.collection, name: parsed.name }
    })
    .filter((x): x is { id: string, collection: string, name: string } => x !== null)

  return { components: allComponents, icons, optionalChunks }
}

const colorMode = useColorMode()
const appIsDark = computed(() => colorMode.value === 'dark')

// Preview dark mode: follows app by default, can be independently toggled.
// null = follow app, true/false = independent override.
const PREVIEW_DARK_KEY = 'playshape:preview-dark-mode'
const previewDarkOverride = ref<boolean | null>(
  typeof localStorage !== 'undefined'
    ? (() => { const v = localStorage.getItem(PREVIEW_DARK_KEY); return v === null ? null : v === 'true' })()
    : null,
)

const previewIsDark = computed(() =>
  previewDarkOverride.value !== null ? previewDarkOverride.value : appIsDark.value,
)

const isFollowingApp = computed(() => previewDarkOverride.value === null)

function togglePreviewDark() {
  // Toggle to the opposite of the current effective state
  const next = !previewIsDark.value
  previewDarkOverride.value = next
  localStorage.setItem(PREVIEW_DARK_KEY, String(next))
  syncThemeToIframe(next)
}

function resetToFollowApp() {
  previewDarkOverride.value = null
  localStorage.removeItem(PREVIEW_DARK_KEY)
  syncThemeToIframe(appIsDark.value)
}

function syncThemeToIframe(dark: boolean) {
  if (iframeRef.value?.contentWindow) {
    iframeRef.value.contentWindow.postMessage({ type: 'theme', dark }, '*')
  }
  if (popupWindow.value && !popupWindow.value.closed && popupReady.value) {
    popupWindow.value.postMessage({ type: 'theme', dark }, '*')
  }
}

const iframeRef = ref<HTMLIFrameElement | null>(null)
const iframeReady = ref(false)
const iframeFocused = ref(false)
const previewError = ref<string | null>(null)

// ─── CourseAPI Toast ─────────────────────────────────────────────────────────

interface CourseApiToast {
  event: string
  score?: number | null
  // record-specific fields
  verb?: string
  objectName?: string
  correct?: boolean
  response?: string
  visible: boolean
}

const courseApiToast = ref<CourseApiToast>({ event: '', visible: false })
let courseApiToastTimer: ReturnType<typeof setTimeout> | undefined

function showCourseApiToast(data: Record<string, unknown>) {
  clearTimeout(courseApiToastTimer)
  const duration = data.event === 'record' ? 2000 : 3000
  courseApiToast.value = {
    event: data.event as string,
    score: data.score as number | null | undefined,
    verb: data.verb as string | undefined,
    objectName: data.objectName as string | undefined,
    correct: data.correct as boolean | undefined,
    response: data.response as string | undefined,
    visible: true,
  }
  courseApiToastTimer = setTimeout(() => {
    courseApiToast.value.visible = false
  }, duration)
}

// ─── Popup Window ────────────────────────────────────────────────────────────

const popupWindow = ref<Window | null>(null)
const popupReady = ref(false)

/** Check if the popup is still open (user may close it manually). */
const isPopupOpen = computed(() => !!popupWindow.value && !popupWindow.value.closed)

/**
 * Whether the iframe needs allow-same-origin.
 * Required for:
 * - Nuxt UI components (ES module imports need same-origin)
 * - Activity tools (they may load web workers, dynamic scripts, etc.)
 * 
 * We always enable allow-same-origin now because Nuxt UI component loading
 * requires ES module dynamic imports, which fail from a null/opaque origin.
 */
const needsSameOrigin = computed(() => true)

/**
 * Merge all dependencies from main component and slot content.
 */
const allDependencies = computed(() => {
  const allDeps = [...(props.dependencies || [])]
  const seen = new Set(allDeps.map(d => d.url))
  for (const dep of (props.slotContent?.dependencies || [])) {
    if (!seen.has(dep.url)) {
      allDeps.push(dep)
      seen.add(dep.url)
    }
  }
  return allDeps
})

/**
 * Get tool configuration for sending to the iframe.
 */
const toolConfigs = computed(() => {
  if (!props.tools?.length) return []
  return getTools(props.tools).map(tool => ({
    id: tool.id,
    headHtml: tool.styles.map(url => `<link rel="stylesheet" href="${url}">`).join('')
              + tool.scripts.map(url => '<script src="' + url + '"></' + 'script>').join(''),
    setupJs: tool.setup || '',
  }))
})

/**
 * Build the global→moduleCache mappings for activity tools.
 * This lets SFC imports like `import monaco from 'monaco-editor'` resolve.
 */
const toolModuleMappings = computed(() => {
  if (!props.tools?.length) return {}
  const mappings: Record<string, string> = {}
  for (const tool of getTools(props.tools)) {
    // Map the tool id to its global (e.g., 'code-editor' -> 'monaco')
    // The component can use window[global] directly
    mappings[tool.id] = tool.global
  }
  return mappings
})

// The iframe URL - using a static route ensures same-origin for ES module imports
const iframeSrc = '/preview'

// ─── Iframe Initialization ───────────────────────────────────────────────────

/**
 * Send initialization message to iframe with dependencies, tools, and theme.
 * Called when the iframe shell signals it's ready via 'preview-shell-ready'.
 */
function sendInit(target?: Window) {
  const win = target || iframeRef.value?.contentWindow
  if (!win) return
  
  win.postMessage({
    type: 'init',
    dependencies: allDependencies.value,
    tools: toolConfigs.value,
    dark: previewIsDark.value,
  }, '*')
}

/**
 * Called when the iframe finishes loading (via @load on the element).
 * The static /preview route signals 'preview-shell-ready' once its JS runs,
 * which triggers sendInit(). We don't send anything on @load anymore since
 * the shell needs to signal readiness first.
 */
function onIframeLoad() {
  // The iframe has loaded the HTML shell. Now we wait for 'preview-shell-ready'
  // message from the iframe's inline script before sending init.
}

// Listen for messages from the iframe
function onIframeMessage(event: MessageEvent) {
  // Only handle messages from our iframe or popup
  const isFromIframe = iframeRef.value?.contentWindow && event.source === iframeRef.value.contentWindow
  const isFromPopup = popupWindow.value && !popupWindow.value.closed && event.source === popupWindow.value
  if (!isFromIframe && !isFromPopup) return

  if (event.data?.type === 'preview-shell-ready') {
    // The static preview shell has loaded and is ready for initialization.
    // Send dependencies, tools, and theme configuration.
    if (isFromIframe) {
      sendInit()
    }
    else if (isFromPopup && popupWindow.value) {
      sendInit(popupWindow.value)
    }
  }
  else if (event.data?.type === 'preview-ready') {
    // The preview shell has finished loading dependencies and tools.
    // Now it's ready to receive component updates.
    if (isFromIframe) {
      iframeReady.value = true
      sendUpdate()
      if (props.brand) sendBrand()
    }
    else if (isFromPopup) {
      popupReady.value = true
      sendUpdate()
      if (props.brand) sendBrand()
    }
  }
  else if (event.data?.type === 'preview-error') {
    previewError.value = event.data.error
    emit('error', event.data.error)
  }
  else if (event.data?.type === 'preview-mounted') {
    previewError.value = null
    emit('error', null)
  }
  else if (event.data?.type === 'courseapi-event') {
    showCourseApiToast(event.data)
  }
}

// Track iframe focus: when the user clicks into the iframe, the parent window
// fires 'blur'. When they click back out, the parent fires 'focus'.
function onWindowBlur() {
  // Check if focus moved to our iframe (not another window/tab)
  if (document.activeElement === iframeRef.value) {
    iframeFocused.value = true
  }
}
function onWindowFocus() {
  iframeFocused.value = false
}

// When the user explicitly changes their app theme in settings,
// reset the preview override so it follows the new theme.
function onThemeReset() {
  previewDarkOverride.value = null
  syncThemeToIframe(appIsDark.value)
}

onMounted(() => {
  window.addEventListener('message', onIframeMessage)
  window.addEventListener('blur', onWindowBlur)
  window.addEventListener('focus', onWindowFocus)
  window.addEventListener('playshape:theme-reset', onThemeReset)
})
onUnmounted(() => {
  window.removeEventListener('message', onIframeMessage)
  window.removeEventListener('blur', onWindowBlur)
  window.removeEventListener('focus', onWindowFocus)
  window.removeEventListener('playshape:theme-reset', onThemeReset)
  closePopup()
})

/**
 * Build the update message payload (reused for iframe and popup).
 */
function buildUpdatePayload() {
  const depMappings: Record<string, string> = {
    ...toRaw(toolModuleMappings.value),
  }
  for (const dep of (props.dependencies || [])) {
    depMappings[dep.name] = dep.global
  }
  let slotContentPayload = null
  if (props.slotContent?.sfc) {
    const slotDepMappings: Record<string, string> = {}
    for (const dep of (props.slotContent.dependencies || [])) {
      slotDepMappings[dep.name] = dep.global
    }
    slotContentPayload = {
      sfc: props.slotContent.sfc,
      // Use processed slot data (markdown→HTML for textarea fields)
      data: JSON.parse(JSON.stringify(processedSlotData.value ?? props.slotContent.data)),
      depMappings: slotDepMappings,
      name: props.slotContent.name || 'Activity',
    }
  }

  // Analyze Nuxt UI component and icon usage
  let nuxtUIPayload = null
  console.log('[NuxtUI Debug] buildUpdatePayload - nuxtUIAvailable:', nuxtUIAvailable.value, 'hasManifest:', !!nuxtUIManifest.value)
  if (nuxtUIAvailable.value && nuxtUIManifest.value) {
    // Analyze main component
    const mainAnalysis = analyzeNuxtUIUsage(props.componentSource)
    console.log('[NuxtUI Debug] Main component analysis:', {
      components: mainAnalysis.components,
      icons: mainAnalysis.icons.map(i => i.id),
      optionalChunks: mainAnalysis.optionalChunks,
    })

    // Also analyze slot content if present
    let slotAnalysis = { components: [] as string[], icons: [] as Array<{ id: string, collection: string, name: string }>, optionalChunks: [] as string[] }
    if (props.slotContent?.sfc) {
      slotAnalysis = analyzeNuxtUIUsage(props.slotContent.sfc)
      console.log('[NuxtUI Debug] Slot content analysis:', {
        components: slotAnalysis.components,
        icons: slotAnalysis.icons.map(i => i.id),
      })
    }

    // Merge analyses
    const allComponents = [...new Set([...mainAnalysis.components, ...slotAnalysis.components])]
    const allIcons = [...mainAnalysis.icons, ...slotAnalysis.icons]
      .filter((icon, i, arr) => arr.findIndex(x => x.id === icon.id) === i) // dedupe by id
    const allChunks = [...new Set([...mainAnalysis.optionalChunks, ...slotAnalysis.optionalChunks])]

    if (allComponents.length > 0 || allIcons.length > 0) {
      nuxtUIPayload = {
        components: allComponents,
        icons: allIcons,
        optionalChunks: allChunks,
      }
      console.log('[NuxtUI Debug] Sending nuxtUI payload:', nuxtUIPayload)
    }
    else {
      console.log('[NuxtUI Debug] No components or icons detected in SFC')
    }
  }
  else {
    console.log('[NuxtUI Debug] Skipping Nuxt UI analysis - not available')
  }

  return {
    type: 'update' as const,
    sfc: props.componentSource,
    // Use processed data (markdown→HTML for textarea fields)
    data: JSON.parse(JSON.stringify(processedData.value)),
    depMappings,
    slotContent: slotContentPayload,
    nuxtUI: nuxtUIPayload,
  }
}

/**
 * Send the current SFC source and data to the iframe for rendering.
 */
function sendUpdate() {
  const payload = buildUpdatePayload()
  if (iframeRef.value?.contentWindow) {
    iframeRef.value.contentWindow.postMessage(payload, '*')
  }
  // Also forward to popup window if open
  if (popupWindow.value && !popupWindow.value.closed && popupReady.value) {
    popupWindow.value.postMessage(payload, '*')
  }
}

// Re-send whenever the component source, data, or slot content changes
watch(() => [props.componentSource, props.data, props.slotContent], () => {
  if (iframeReady.value) {
    previewError.value = null
    sendUpdate()
  }
}, { deep: true })

// When following app, sync dark mode changes to iframe
watch(appIsDark, (dark) => {
  if (previewDarkOverride.value !== null) return // independent, don't sync
  syncThemeToIframe(dark)
})

// ─── Brand Injection ─────────────────────────────────────────────────────────

function buildBrandPayload() {
  if (!props.brand) return { type: 'brand' as const, css: null, fontLink: null }
  return {
    type: 'brand' as const,
    css: generateBrandCSS(props.brand),
    fontLink: getBrandFontLink(props.brand),
  }
}

function sendBrand() {
  const payload = buildBrandPayload()
  if (iframeRef.value?.contentWindow) {
    iframeRef.value.contentWindow.postMessage(payload, '*')
  }
  if (popupWindow.value && !popupWindow.value.closed && popupReady.value) {
    popupWindow.value.postMessage(payload, '*')
  }
}

// Re-send brand when prop changes
watch(() => props.brand, () => {
  if (iframeReady.value) sendBrand()
}, { deep: true })

// ─── Popup Window ────────────────────────────────────────────────────────────

/**
 * Open the preview in a separate browser window.
 * The popup loads the static /preview route and receives updates via postMessage.
 */
function openPopup() {
  // If already open, focus it
  if (popupWindow.value && !popupWindow.value.closed) {
    popupWindow.value.focus()
    return
  }

  popupReady.value = false

  // Open the static preview route. The popup will signal 'preview-shell-ready'
  // once loaded, which triggers initialization via onIframeMessage.
  const popup = window.open(iframeSrc, '_blank', 'width=900,height=700,menubar=no,toolbar=no,location=no,status=no')
  if (!popup) return

  popupWindow.value = popup

  // The popup will send 'preview-shell-ready' -> we send 'init' -> it sends 'preview-ready'
  // All handled by the existing onIframeMessage handler which checks event.source

  // Detect when user closes the popup
  const checkClosed = setInterval(() => {
    if (popup.closed) {
      clearInterval(checkClosed)
      popupWindow.value = null
      popupReady.value = false
    }
  }, 500)
}

function closePopup() {
  if (popupWindow.value && !popupWindow.value.closed) {
    popupWindow.value.close()
  }
  popupWindow.value = null
  popupReady.value = false
}

/**
 * Generate a thumbnail for this template using Electron's offscreen rendering.
 * Returns a base64-encoded JPEG data URL, or null if not in Electron or if
 * the component source is empty.
 */
async function generateThumbnail(): Promise<string | null> {
  const electron = (window as unknown as { electron?: { generateThumbnail: (args: {
    url: string
    initPayload: {
      dependencies: Array<{ name: string, url: string, global: string }>
      tools: Array<{ id: string, headHtml: string, setupJs: string }>
      dark: boolean
    }
    updatePayload: ReturnType<typeof buildUpdatePayload>
    brandPayload?: ReturnType<typeof buildBrandPayload>
  }) => Promise<string> } }).electron

  if (!electron || !props.componentSource) return null

  // Include brand styling so the thumbnail matches the branded preview
  const brandPayload = props.brand ? buildBrandPayload() : undefined

  try {
    return await electron.generateThumbnail({
      url: iframeSrc,
      initPayload: {
        dependencies: allDependencies.value,
        tools: toolConfigs.value,
        dark: previewIsDark.value,
      },
      updatePayload: buildUpdatePayload(),
      brandPayload,
    })
  }
  catch (err) {
    console.error('[TemplatePreview] Thumbnail generation failed:', err)
    return null
  }
}

defineExpose({ generateThumbnail })
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden">
    <!-- Preview header -->
    <div class="flex items-center justify-between px-4 py-2 border-b border-default bg-elevated/50">
      <div class="flex items-center gap-2 text-sm text-muted">
        <UIcon name="i-lucide-eye" class="size-4" />
        <span>Preview</span>
        <UBadge
          v-if="previewError"
          color="error"
          variant="subtle"
          label="Error"
          size="xs"
        />
        <UBadge
          v-else-if="componentSource && iframeFocused"
          color="success"
          variant="subtle"
          label="Active"
          size="xs"
        />
        <UBadge
          v-else-if="componentSource"
          color="neutral"
          variant="subtle"
          label="Inactive"
          size="xs"
        />
      </div>
      <div class="flex items-center gap-1">
        <slot name="header-actions" />
        <UTooltip :text="isFollowingApp ? 'Following app theme' : (previewIsDark ? 'Dark (independent)' : 'Light (independent)')">
          <UButton
            :icon="previewIsDark ? 'i-lucide-moon' : 'i-lucide-sun'"
            size="xs"
            variant="ghost"
            :color="isFollowingApp ? 'neutral' : 'primary'"
            @click="togglePreviewDark"
            @dblclick.prevent="resetToFollowApp"
          />
        </UTooltip>
        <UTooltip :text="isPopupOpen ? 'Close popup' : 'Open in new window'">
          <UButton
            v-if="componentSource"
            :icon="isPopupOpen ? 'i-lucide-picture-in-picture-2' : 'i-lucide-external-link'"
            size="xs"
            variant="ghost"
            :color="isPopupOpen ? 'primary' : 'neutral'"
            @click="isPopupOpen ? closePopup() : openPopup()"
          />
        </UTooltip>
        <UButton
          v-if="componentSource"
          icon="i-lucide-refresh-cw"
          size="xs"
          variant="ghost"
          color="neutral"
          @click="sendUpdate"
        />
      </div>
    </div>

    <!-- Iframe or empty state -->
    <div class="flex-1 relative">
      <template v-if="componentSource">
        <iframe
          ref="iframeRef"
          :src="iframeSrc"
          :sandbox="needsSameOrigin ? 'allow-scripts allow-same-origin' : 'allow-scripts'"
          class="w-full h-full border-0"
          title="Template Preview"
          @load="onIframeLoad"
        />
      </template>
      <template v-else>
        <div class="flex flex-col items-center justify-center h-full text-center">
          <UIcon name="i-lucide-layout-template" class="size-8 text-muted mb-2" />
          <p class="text-sm text-muted">Preview will appear here</p>
          <p class="text-xs text-dimmed mt-1">Start a conversation to generate a template</p>
        </div>
      </template>

      <!-- CourseAPI event toast -->
      <Transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="opacity-0 translate-y-2"
        enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition duration-300 ease-in"
        leave-from-class="opacity-100 translate-y-0"
        leave-to-class="opacity-0 translate-y-2"
      >
        <div
          v-if="courseApiToast.visible"
          :key="courseApiToast.event + '-' + Date.now()"
          class="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 px-3 py-1.5 rounded-lg shadow-lg text-xs font-medium"
          :class="courseApiToast.event === 'record'
            ? (courseApiToast.correct === true ? 'bg-green-500/90 text-white'
              : courseApiToast.correct === false ? 'bg-red-500/90 text-white'
              : 'bg-neutral-700/90 text-white')
            : (courseApiToast.event === 'complete' ? 'bg-green-500/90 text-white' : 'bg-red-500/90 text-white')"
        >
          <!-- Icon -->
          <UIcon
            :name="courseApiToast.event === 'record'
              ? (courseApiToast.correct === true ? 'i-lucide-check'
                : courseApiToast.correct === false ? 'i-lucide-x'
                : 'i-lucide-activity')
              : (courseApiToast.event === 'complete' ? 'i-lucide-check-circle' : 'i-lucide-x-circle')"
            class="size-3.5"
          />

          <!-- Complete / Fail label -->
          <span v-if="courseApiToast.event !== 'record'">
            {{ courseApiToast.event === 'complete' ? 'Complete' : 'Failed' }}
            <template v-if="courseApiToast.score != null">
              &middot; Score: {{ Math.round(courseApiToast.score * 100) }}%
            </template>
          </span>

          <!-- Record label -->
          <span v-else>
            {{ courseApiToast.verb }}
            <template v-if="courseApiToast.objectName">
              &middot; {{ courseApiToast.objectName }}
            </template>
            <template v-if="courseApiToast.response">
              &middot; "{{ courseApiToast.response.length > 30 ? courseApiToast.response.slice(0, 30) + '...' : courseApiToast.response }}"
            </template>
            <template v-if="courseApiToast.score != null">
              &middot; {{ Math.round(courseApiToast.score * 100) }}%
            </template>
          </span>
        </div>
      </Transition>
    </div>
  </div>
</template>
