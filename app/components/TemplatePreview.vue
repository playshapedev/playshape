<script setup lang="ts">
import type { Brand } from '~/composables/useBrands'
import { COURSE_API_PREVIEW_SCRIPT } from '~/utils/courseApi/preview'

interface Dependency {
  name: string
  url: string
  global: string
}

interface SlotContent {
  sfc: string
  data: Record<string, unknown>
  dependencies?: Dependency[]
}

const props = defineProps<{
  componentSource: string
  data: Record<string, unknown>
  dependencies?: Dependency[]
  tools?: string[]
  /** When provided, the component is treated as a wrapper — slotContent is rendered inside <slot name="activity"> */
  slotContent?: SlotContent | null
  /** When provided, overrides the design tokens in the preview iframe */
  brand?: Brand | null
}>()

const emit = defineEmits<{
  error: [message: string | null]
}>()

const { getTools, getToolHeadHtml, getToolSetupJs } = useActivityTools()

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
 * Required when activity tools are used (they may load web workers,
 * dynamic scripts, etc. that need a real origin).
 */
const needsSameOrigin = computed(() => !!props.tools?.length)

/**
 * The HTML document loaded inside the sandboxed iframe.
 * It loads Vue 3 and vue3-sfc-loader from CDN, plus any dependencies
 * and activity tool scripts, then listens for postMessage events to
 * compile and mount SFC components.
 */
const dependencyScriptTags = computed(() => {
  // Merge main dependencies + slot content dependencies, deduplicating by URL
  const allDeps = [...(props.dependencies || [])]
  const seen = new Set(allDeps.map(d => d.url))
  for (const dep of (props.slotContent?.dependencies || [])) {
    if (!seen.has(dep.url)) {
      allDeps.push(dep)
      seen.add(dep.url)
    }
  }
  if (!allDeps.length) return ''
  return allDeps
    .map(dep => `  <script src="${dep.url}"><\/script>`)
    .join('\n')
})

const toolHeadHtml = computed(() => {
  if (!props.tools?.length) return ''
  return getToolHeadHtml(props.tools)
})

const toolSetupJs = computed(() => {
  if (!props.tools?.length) return ''
  return getToolSetupJs(props.tools)
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

const iframeSrcdoc = computed(() => `<!DOCTYPE html>
<html class="${previewIsDark.value ? 'dark' : ''}" style="color-scheme: ${previewIsDark.value ? 'dark' : 'light'}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <script>
    // Suppress Tailwind CDN production warning before it loads
    var _origWarn = console.warn;
    console.warn = function() {
      if (typeof arguments[0] === 'string' && arguments[0].indexOf('cdn.tailwindcss.com') !== -1) return;
      _origWarn.apply(console, arguments);
    };
  <\/script>
  <script src="https://cdn.tailwindcss.com"><\/script>
${dependencyScriptTags.value}
  <script src="https://unpkg.com/vue@3/dist/vue.global.prod.js"><\/script>
  <script src="https://cdn.jsdelivr.net/npm/vue3-sfc-loader@0.9.5/dist/vue3-sfc-loader.js"><\/script>
${toolHeadHtml.value}
  <script>
    // ── CourseAPI (Preview Adapter) ──────────────────────────
    ${COURSE_API_PREVIEW_SCRIPT}
  <\/script>
  <style>
    body { margin: 0; padding: 0; font-family: 'Poppins', system-ui, -apple-system, sans-serif; }
    #app { min-height: 100vh; }
    .preview-error { color: #ef4444; padding: 16px; font-size: 14px; white-space: pre-wrap; font-family: monospace; }
    .preview-empty { display: flex; align-items: center; justify-content: center; height: 100vh; color: #9ca3af; font-size: 14px; }

    /*
     * Playshape Design Tokens
     * Mirrors Nuxt UI's CSS custom property system so LLM-generated
     * components can use semantic variables and look consistent with the app.
     * These defaults match the playshape theme (playshape primary, slate neutral).
     */

    /* ── Color Scales ─────────────────────────────────────────── */
    :root {
      /* Primary (playshape purple) */
      --ui-color-primary-50: #eef0ff;
      --ui-color-primary-100: #e0e2ff;
      --ui-color-primary-200: #c7c9ff;
      --ui-color-primary-300: #a5a5ff;
      --ui-color-primary-400: #8a7dfc;
      --ui-color-primary-500: #7458f5;
      --ui-color-primary-600: #5f38e8;
      --ui-color-primary-700: #4e29cc;
      --ui-color-primary-800: #3e24a4;
      --ui-color-primary-900: #2e3086;
      --ui-color-primary-950: #1c1a5e;

      /* Neutral (slate) */
      --ui-color-neutral-50: #f8fafc;
      --ui-color-neutral-100: #f1f5f9;
      --ui-color-neutral-200: #e2e8f0;
      --ui-color-neutral-300: #cbd5e1;
      --ui-color-neutral-400: #94a3b8;
      --ui-color-neutral-500: #64748b;
      --ui-color-neutral-600: #475569;
      --ui-color-neutral-700: #334155;
      --ui-color-neutral-800: #1e293b;
      --ui-color-neutral-900: #0f172a;
      --ui-color-neutral-950: #020617;

      /* Semantic color shades (green for success, blue for info, etc.) */
      --ui-color-success: #22c55e;
      --ui-color-info: #3b82f6;
      --ui-color-warning: #eab308;
      --ui-color-error: #ef4444;
    }

    /* ── Semantic Design Tokens (Light) ───────────────────────── */
    :root {
      /* Primary accent */
      --ui-primary: var(--ui-color-primary-500);

      /* Text */
      --ui-text-dimmed: var(--ui-color-neutral-400);
      --ui-text-muted: var(--ui-color-neutral-500);
      --ui-text-toned: var(--ui-color-neutral-600);
      --ui-text: var(--ui-color-neutral-700);
      --ui-text-highlighted: var(--ui-color-neutral-900);
      --ui-text-inverted: #fff;

      /* Background */
      --ui-bg: #fff;
      --ui-bg-muted: var(--ui-color-neutral-50);
      --ui-bg-elevated: var(--ui-color-neutral-100);
      --ui-bg-accented: var(--ui-color-neutral-200);
      --ui-bg-inverted: var(--ui-color-neutral-900);

      /* Border */
      --ui-border: var(--ui-color-neutral-200);
      --ui-border-muted: var(--ui-color-neutral-200);
      --ui-border-accented: var(--ui-color-neutral-300);
      --ui-border-inverted: var(--ui-color-neutral-900);

      /* Spacing & Shape */
      --ui-radius: 0.325rem;
    }

    /* ── Semantic Design Tokens (Dark) ────────────────────────── */
    .dark {
      --ui-primary: var(--ui-color-primary-400);

      --ui-text-dimmed: var(--ui-color-neutral-500);
      --ui-text-muted: var(--ui-color-neutral-400);
      --ui-text-toned: var(--ui-color-neutral-300);
      --ui-text: var(--ui-color-neutral-200);
      --ui-text-highlighted: #fff;
      --ui-text-inverted: var(--ui-color-neutral-900);

      --ui-bg: var(--ui-color-neutral-900);
      --ui-bg-muted: var(--ui-color-neutral-800);
      --ui-bg-elevated: var(--ui-color-neutral-800);
      --ui-bg-accented: var(--ui-color-neutral-700);
      --ui-bg-inverted: #fff;

      --ui-border: var(--ui-color-neutral-800);
      --ui-border-muted: var(--ui-color-neutral-700);
      --ui-border-accented: var(--ui-color-neutral-700);
      --ui-border-inverted: #fff;
    }
  </style>
  <script>
    // Configure Tailwind CDN to recognize design token utilities
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          colors: {
            primary: {
              50: 'var(--ui-color-primary-50)',
              100: 'var(--ui-color-primary-100)',
              200: 'var(--ui-color-primary-200)',
              300: 'var(--ui-color-primary-300)',
              400: 'var(--ui-color-primary-400)',
              500: 'var(--ui-color-primary-500)',
              600: 'var(--ui-color-primary-600)',
              700: 'var(--ui-color-primary-700)',
              800: 'var(--ui-color-primary-800)',
              900: 'var(--ui-color-primary-900)',
              950: 'var(--ui-color-primary-950)',
              DEFAULT: 'var(--ui-primary)',
            },
            neutral: {
              50: 'var(--ui-color-neutral-50)',
              100: 'var(--ui-color-neutral-100)',
              200: 'var(--ui-color-neutral-200)',
              300: 'var(--ui-color-neutral-300)',
              400: 'var(--ui-color-neutral-400)',
              500: 'var(--ui-color-neutral-500)',
              600: 'var(--ui-color-neutral-600)',
              700: 'var(--ui-color-neutral-700)',
              800: 'var(--ui-color-neutral-800)',
              900: 'var(--ui-color-neutral-900)',
              950: 'var(--ui-color-neutral-950)',
            },
          },
          borderRadius: {
            ui: 'var(--ui-radius)',
          },
          textColor: {
            default: 'var(--ui-text)',
            muted: 'var(--ui-text-muted)',
            dimmed: 'var(--ui-text-dimmed)',
            toned: 'var(--ui-text-toned)',
            highlighted: 'var(--ui-text-highlighted)',
            inverted: 'var(--ui-text-inverted)',
          },
          backgroundColor: {
            default: 'var(--ui-bg)',
            muted: 'var(--ui-bg-muted)',
            elevated: 'var(--ui-bg-elevated)',
            accented: 'var(--ui-bg-accented)',
            inverted: 'var(--ui-bg-inverted)',
          },
          borderColor: {
            default: 'var(--ui-border)',
            muted: 'var(--ui-border-muted)',
            accented: 'var(--ui-border-accented)',
            inverted: 'var(--ui-border-inverted)',
          },
        },
      },
    }
  <\/script>
</head>
<body>
  <div id="app"></div>
  <script>
    // Activity tool setup (configures tools before they are used)
${toolSetupJs.value}

    const { createApp, defineAsyncComponent, reactive, h } = Vue;
    const { loadModule } = window['vue3-sfc-loader'];

    // Resolve the host window: parent (iframe) or opener (popup)
    var hostWindow = window.parent !== window ? window.parent : window.opener;
    function postToHost(msg) { if (hostWindow) hostWindow.postMessage(msg, '*'); }

    let currentApp = null;
    let depMappings = {}; // { packageName: globalVarName }

    function makeLoaderOptions(moduleCache, fileMap) {
      return {
        moduleCache,
        getFile(url) {
          if (fileMap[url]) return Promise.resolve(fileMap[url]);
          return fetch(url).then(r => r.ok ? r.text() : Promise.reject(new Error(url + ' ' + r.statusText)));
        },
        addStyle(textContent) {
          const style = Object.assign(document.createElement('style'), { textContent });
          document.head.appendChild(style);
        },
      };
    }

    async function mountComponent(sfcSource, data, slotContent) {
      // Unmount previous app
      if (currentApp) {
        try { currentApp.unmount(); } catch {}
        currentApp = null;
      }

      const appEl = document.getElementById('app');
      appEl.innerHTML = '';

      if (!sfcSource) {
        appEl.innerHTML = '<div class="preview-empty">No component to preview</div>';
        return;
      }

      try {
        // Wait for any async tool initialization (e.g., Monaco AMD loading)
        if (window.__monacoReady) await window.__monacoReady;

        // Build moduleCache: map package names to their globals so SFC imports resolve
        const moduleCache = { vue: Vue };
        for (const [pkg, globalName] of Object.entries(depMappings)) {
          if (window[globalName]) moduleCache[pkg] = window[globalName];
        }

        const mainOptions = makeLoaderOptions(moduleCache, { '/component.vue': sfcSource });
        const MainComp = defineAsyncComponent(() => loadModule('/component.vue', mainOptions));

        // If slotContent is provided, compile the activity SFC and compose them
        let SlotComp = null;
        if (slotContent && slotContent.sfc) {
          // Merge slot dependency mappings into moduleCache
          const slotModuleCache = { ...moduleCache };
          if (slotContent.depMappings) {
            for (const [pkg, globalName] of Object.entries(slotContent.depMappings)) {
              if (window[globalName]) slotModuleCache[pkg] = window[globalName];
            }
          }
          const slotOptions = makeLoaderOptions(slotModuleCache, { '/activity.vue': slotContent.sfc });
          SlotComp = defineAsyncComponent(() => loadModule('/activity.vue', slotOptions));
        }

        currentApp = createApp({
          render() {
            const slots = {};
            if (SlotComp && slotContent) {
              slots.activity = () => h(SlotComp, { data: slotContent.data || {} });
            }
            return h(MainComp, { data }, slots);
          }
        });

        currentApp.config.errorHandler = (err) => {
          appEl.innerHTML = '<div class="preview-error">Runtime error:\\n' + (err.message || err) + '</div>';
          postToHost({ type: 'preview-error', error: err.message || String(err) });
        };

        currentApp.mount(appEl);
        postToHost({ type: 'preview-mounted' });
      } catch (err) {
        appEl.innerHTML = '<div class="preview-error">Compile error:\\n' + (err.message || err) + '</div>';
        postToHost({ type: 'preview-error', error: err.message || String(err) });
      }
    }

    window.addEventListener('message', (event) => {
      if (event.data?.type === 'update') {
        if (event.data.depMappings) depMappings = event.data.depMappings;
        mountComponent(event.data.sfc, event.data.data || {}, event.data.slotContent || null);
      }
      else if (event.data?.type === 'theme') {
        var isDark = event.data.dark;
        document.documentElement.classList.toggle('dark', isDark);
        document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
      }
      else if (event.data?.type === 'brand') {
        // Inject or update brand CSS overrides
        var brandStyleId = 'brand-override';
        var brandFontId = 'brand-font';
        var existing = document.getElementById(brandStyleId);
        if (event.data.css) {
          if (existing) { existing.textContent = event.data.css; }
          else {
            var s = document.createElement('style');
            s.id = brandStyleId;
            s.textContent = event.data.css;
            document.head.appendChild(s);
          }
        } else if (existing) {
          existing.remove();
        }
        // Inject or update Google Font link
        var existingFont = document.getElementById(brandFontId);
        if (event.data.fontLink) {
          if (existingFont) { existingFont.setAttribute('href', event.data.fontLink); }
          else {
            var link = document.createElement('link');
            link.id = brandFontId;
            link.rel = 'stylesheet';
            link.href = event.data.fontLink;
            document.head.appendChild(link);
          }
        } else if (existingFont) {
          existingFont.remove();
        }
      }
    });

    // Signal that the iframe/popup is ready
    postToHost({ type: 'preview-ready' });
  <\/script>
</body>
</html>`)

// Reset iframeReady when the srcdoc changes — the old iframe is being torn down
// and a new one will load. Without this, sendUpdate() could fire into the dying iframe.
watch(iframeSrcdoc, () => {
  iframeReady.value = false
})

/**
 * Called when the iframe finishes loading (via @load on the element).
 * This is more reliable than postMessage('preview-ready') for initial load
 * because the @load binding is on the element itself — it can't be missed
 * due to late addEventListener registration. The iframe's inline scripts
 * have already executed by the time 'load' fires.
 */
function onIframeLoad() {
  iframeReady.value = true
  sendUpdate()
  if (props.brand) sendBrand()
}

// Listen for messages from the iframe
function onIframeMessage(event: MessageEvent) {
  if (event.data?.type === 'preview-ready') {
    // Belt-and-suspenders: also handle the postMessage in case @load didn't fire
    // (shouldn't happen, but defensive)
    if (!iframeReady.value) {
      iframeReady.value = true
      sendUpdate()
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
      data: JSON.parse(JSON.stringify(props.slotContent.data)),
      depMappings: slotDepMappings,
    }
  }
  return {
    type: 'update' as const,
    sfc: props.componentSource,
    data: JSON.parse(JSON.stringify(props.data)),
    depMappings,
    slotContent: slotContentPayload,
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
 * The popup loads the same srcdoc HTML and receives updates via postMessage.
 */
function openPopup() {
  // If already open, focus it
  if (popupWindow.value && !popupWindow.value.closed) {
    popupWindow.value.focus()
    return
  }

  popupReady.value = false

  // Open about:blank — it inherits the opener's origin, so window.opener
  // and postMessage work without cross-origin issues.
  const popup = window.open('about:blank', '_blank', 'width=900,height=700,menubar=no,toolbar=no,location=no,status=no')
  if (!popup) return

  popupWindow.value = popup

  // Write the srcdoc HTML into the popup. External <script src> tags
  // load normally because the document is same-origin (about:blank inherits).
  popup.document.open()
  popup.document.write(iframeSrcdoc.value)
  popup.document.close()

  // Listen for readiness via two channels:
  // 1. postMessage 'preview-ready' from the popup's inline script (most reliable)
  // 2. Fallback: poll for Vue global on the popup window
  const onPopupMessage = (event: MessageEvent) => {
    if (event.source !== popup) return
    if (event.data?.type === 'preview-ready') {
      initPopup()
    }
  }
  window.addEventListener('message', onPopupMessage)

  let initialized = false
  function initPopup() {
    if (initialized || !popup || popup.closed) return
    initialized = true
    popupReady.value = true
    popup.postMessage(buildUpdatePayload(), '*')
    popup.postMessage({ type: 'theme', dark: previewIsDark.value }, '*')
    if (props.brand) popup.postMessage(buildBrandPayload(), '*')
  }

  // Fallback: poll until Vue is loaded on the popup, then trigger init.
  // This handles cases where postMessage from popup to opener doesn't work
  // (e.g. Electron quirks with window.opener).
  const pollReady = setInterval(() => {
    try {
      if (popup.closed) {
        clearInterval(pollReady)
        return
      }
      if ((popup as any).Vue && (popup as any)['vue3-sfc-loader']) {
        clearInterval(pollReady)
        initPopup()
      }
    }
    catch {
      // Cross-origin access error — stop polling, rely on postMessage
      clearInterval(pollReady)
    }
  }, 200)

  // Stop polling after 15s regardless
  setTimeout(() => clearInterval(pollReady), 15000)

  // Detect when user closes the popup
  const checkClosed = setInterval(() => {
    if (popup.closed) {
      clearInterval(checkClosed)
      clearInterval(pollReady)
      window.removeEventListener('message', onPopupMessage)
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
    srcdoc: string
    sfc: string
    data: Record<string, unknown>
    depMappings: Record<string, string>
    brandCSS?: string
    brandFontLink?: string
  }) => Promise<string> } }).electron

  if (!electron || !props.componentSource) return null

  const depMappings: Record<string, string> = {
    ...toRaw(toolModuleMappings.value),
  }
  for (const dep of (props.dependencies || [])) {
    depMappings[dep.name] = dep.global
  }

  // Include brand styling so the thumbnail matches the branded preview
  const brandCSS = props.brand ? generateBrandCSS(props.brand) : undefined
  const brandFontLink = props.brand ? (getBrandFontLink(props.brand) ?? undefined) : undefined

  try {
    return await electron.generateThumbnail({
      srcdoc: iframeSrcdoc.value,
      sfc: props.componentSource,
      data: JSON.parse(JSON.stringify(props.data)),
      depMappings,
      brandCSS,
      brandFontLink,
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
          :srcdoc="iframeSrcdoc"
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
