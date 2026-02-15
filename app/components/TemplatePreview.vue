<script setup lang="ts">
interface Dependency {
  name: string
  url: string
  global: string
}

const props = defineProps<{
  componentSource: string
  data: Record<string, unknown>
  dependencies?: Dependency[]
  tools?: string[]
}>()

const emit = defineEmits<{
  error: [message: string | null]
}>()

const { getTools, getToolHeadHtml, getToolSetupJs } = useActivityTools()

const iframeRef = ref<HTMLIFrameElement | null>(null)
const iframeReady = ref(false)
const previewError = ref<string | null>(null)

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
  if (!props.dependencies?.length) return ''
  return props.dependencies
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
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <script src="https://cdn.tailwindcss.com"><\/script>
${dependencyScriptTags.value}
  <script src="https://unpkg.com/vue@3/dist/vue.global.prod.js"><\/script>
  <script src="https://cdn.jsdelivr.net/npm/vue3-sfc-loader@0.9.5/dist/vue3-sfc-loader.js"><\/script>
${toolHeadHtml.value}
  <style>
    body { margin: 0; padding: 16px; font-family: 'Poppins', system-ui, -apple-system, sans-serif; }
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
    // Suppress Tailwind CDN production warning — this is a sandboxed preview, not production
    const _origWarn = console.warn;
    console.warn = function(...args) {
      if (typeof args[0] === 'string' && args[0].includes('cdn.tailwindcss.com')) return;
      _origWarn.apply(console, args);
    };

    // Activity tool setup (configures tools before they are used)
${toolSetupJs.value}

    const { createApp, defineAsyncComponent, reactive, h } = Vue;
    const { loadModule } = window['vue3-sfc-loader'];

    let currentApp = null;
    let depMappings = {}; // { packageName: globalVarName }

    async function mountComponent(sfcSource, data) {
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

        const options = {
          moduleCache,
          getFile(url) {
            if (url === '/component.vue') return Promise.resolve(sfcSource);
            return fetch(url).then(r => r.ok ? r.text() : Promise.reject(new Error(url + ' ' + r.statusText)));
          },
          addStyle(textContent) {
            const style = Object.assign(document.createElement('style'), { textContent });
            document.head.appendChild(style);
          },
        };

        const AsyncComp = defineAsyncComponent(() => loadModule('/component.vue', options));

        currentApp = createApp({
          render() {
            return h(AsyncComp, { data });
          }
        });

        currentApp.config.errorHandler = (err) => {
          appEl.innerHTML = '<div class="preview-error">Runtime error:\\n' + (err.message || err) + '</div>';
          window.parent.postMessage({ type: 'preview-error', error: err.message || String(err) }, '*');
        };

        currentApp.mount(appEl);
        window.parent.postMessage({ type: 'preview-mounted' }, '*');
      } catch (err) {
        appEl.innerHTML = '<div class="preview-error">Compile error:\\n' + (err.message || err) + '</div>';
        window.parent.postMessage({ type: 'preview-error', error: err.message || String(err) }, '*');
      }
    }

    window.addEventListener('message', (event) => {
      if (event.data?.type === 'update') {
        if (event.data.depMappings) depMappings = event.data.depMappings;
        mountComponent(event.data.sfc, event.data.data || {});
      }
    });

    // Signal that the iframe is ready
    window.parent.postMessage({ type: 'preview-ready' }, '*');
  <\/script>
</body>
</html>`)

// Listen for messages from the iframe
function onIframeMessage(event: MessageEvent) {
  if (event.data?.type === 'preview-ready') {
    iframeReady.value = true
    sendUpdate()
  }
  else if (event.data?.type === 'preview-error') {
    previewError.value = event.data.error
    emit('error', event.data.error)
  }
  else if (event.data?.type === 'preview-mounted') {
    previewError.value = null
    emit('error', null)
  }
}

onMounted(() => window.addEventListener('message', onIframeMessage))
onUnmounted(() => window.removeEventListener('message', onIframeMessage))

/**
 * Send the current SFC source and data to the iframe for rendering.
 */
function sendUpdate() {
  if (!iframeRef.value?.contentWindow) return
  // Build a name→global mapping for the iframe's moduleCache
  const depMappings: Record<string, string> = {
    ...toRaw(toolModuleMappings.value),
  }
  for (const dep of (props.dependencies || [])) {
    depMappings[dep.name] = dep.global
  }
  // Deep-clone to strip Vue reactive proxy — postMessage requires plain objects
  iframeRef.value.contentWindow.postMessage({
    type: 'update',
    sfc: props.componentSource,
    data: JSON.parse(JSON.stringify(props.data)),
    depMappings,
  }, '*')
}

// Re-send whenever the component source or data changes
watch(() => [props.componentSource, props.data], () => {
  if (iframeReady.value) {
    previewError.value = null
    sendUpdate()
  }
}, { deep: true })
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden">
    <!-- Preview header -->
    <div class="flex items-center justify-between px-4 py-2 border-b border-default bg-elevated/50">
      <div class="flex items-center gap-2 text-sm text-muted">
        <UIcon name="i-lucide-eye" class="size-4" />
        <span>Preview</span>
      </div>
      <div class="flex items-center gap-1">
        <UBadge
          v-if="previewError"
          color="error"
          variant="subtle"
          label="Error"
          size="xs"
        />
        <UBadge
          v-else-if="componentSource"
          color="success"
          variant="subtle"
          label="Live"
          size="xs"
        />
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
        />
      </template>
      <template v-else>
        <div class="flex flex-col items-center justify-center h-full text-center">
          <UIcon name="i-lucide-layout-template" class="size-8 text-muted mb-2" />
          <p class="text-sm text-muted">Preview will appear here</p>
          <p class="text-xs text-dimmed mt-1">Start a conversation to generate a template</p>
        </div>
      </template>
    </div>
  </div>
</template>
