/**
 * Static preview shell for the template preview iframe.
 * 
 * This route serves a static HTML document that:
 * 1. Loads Vue 3, vue3-sfc-loader, and Tailwind CSS
 * 2. Listens for postMessage events to receive SFC source, data, and configuration
 * 3. Dynamically loads dependencies and Nuxt UI components as needed
 * 
 * Using a static route (vs blob URL or srcdoc) gives the iframe the same origin
 * as the parent application, which is required for ES module imports to work.
 */

// Import the CourseAPI preview script
// This is bundled into the preview HTML to provide the CourseAPI mock
const COURSE_API_PREVIEW_SCRIPT = `
// CourseAPI Preview Adapter - provides a mock implementation for preview mode
window.CourseAPI = {
  _state: { 
    score: 0, 
    progress: 0,
    completed: false, 
    failed: false,
    location: null,
    suspendData: null
  },
  _listeners: [],
  
  // ─── Lifecycle ─────────────────────────────────────────────────
  initialize: function() {
    console.log('[CourseAPI Preview] Initialized');
  },
  
  terminate: function() {
    console.log('[CourseAPI Preview] Terminated');
  },
  
  // ─── Completion ────────────────────────────────────────────────
  complete: function(options) {
    this._state.completed = true;
    if (options?.score !== undefined) this._state.score = options.score;
    window.parent.postMessage({ type: 'courseapi-event', event: 'complete', score: this._state.score }, '*');
    this._notifyListeners();
  },
  
  fail: function(options) {
    this._state.failed = true;
    if (options?.score !== undefined) this._state.score = options.score;
    window.parent.postMessage({ type: 'courseapi-event', event: 'fail', score: this._state.score }, '*');
    this._notifyListeners();
  },
  
  // ─── Progress ──────────────────────────────────────────────────
  setProgress: function(value) {
    this._state.progress = Math.max(0, Math.min(1, value));
    window.parent.postMessage({ type: 'courseapi-event', event: 'progress', progress: this._state.progress }, '*');
    this._notifyListeners();
  },
  
  // ─── Bookmarking ───────────────────────────────────────────────
  setLocation: function(location) {
    this._state.location = location;
    this._notifyListeners();
  },
  
  getLocation: function() {
    return this._state.location;
  },
  
  // ─── Suspend Data ──────────────────────────────────────────────
  suspend: function(data) {
    this._state.suspendData = JSON.stringify(data);
    this._notifyListeners();
  },
  
  restore: function() {
    if (!this._state.suspendData) return null;
    try {
      return JSON.parse(this._state.suspendData);
    } catch (e) {
      return null;
    }
  },
  
  // ─── Statements ────────────────────────────────────────────────
  record: function(statement) {
    var verb = typeof statement === 'string' ? statement : statement.verb;
    var object = typeof statement === 'string' ? arguments[1] : statement.object;
    var result = typeof statement === 'string' ? arguments[2] : statement.result;
    
    window.parent.postMessage({ 
      type: 'courseapi-event', 
      event: 'record', 
      verb: verb,
      objectId: object?.id,
      objectName: object?.name,
      objectType: object?.type,
      correct: result?.correct,
      score: result?.score, 
      response: result?.response 
    }, '*');
  },
  
  // ─── State (legacy/internal) ───────────────────────────────────
  getState: function() { return { ...this._state }; },
  setState: function(state) { 
    Object.assign(this._state, state); 
    this._notifyListeners();
  },
  
  // ─── Listeners ─────────────────────────────────────────────────
  onStateChange: function(callback) {
    this._listeners.push(callback);
    return function() {
      var idx = this._listeners.indexOf(callback);
      if (idx > -1) this._listeners.splice(idx, 1);
    }.bind(this);
  },
  
  _notifyListeners: function() {
    var state = this.getState();
    this._listeners.forEach(function(cb) { 
      try { cb(state); } catch(e) { console.error('[CourseAPI] Listener error:', e); }
    });
  }
};
`

export default defineEventHandler((event) => {
  setHeader(event, 'Content-Type', 'text/html; charset=utf-8')
  // Short cache for development, can be increased in production
  setHeader(event, 'Cache-Control', 'public, max-age=60')

  return `<!DOCTYPE html>
<html>
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
  </script>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/vue@3/dist/vue.global.prod.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/vue3-sfc-loader@0.9.5/dist/vue3-sfc-loader.js"></script>
  <!-- Import map for ES module resolution (future-proofing for any bare "vue" imports) -->
  <script type="importmap">
    {
      "imports": {
        "vue": "/nuxt-ui/vue.js"
      }
    }
  </script>
  <!-- Nuxt UI runtime state -->
  <script>
    // Browser shim for Node.js process global (used by some libraries)
    window.process = { env: { NODE_ENV: 'production' } };
    
    window.__nuxtUIComponents = {};
    window.__nuxtUIIcons = {};
    window.__nuxtUIReady = false;
    window.__nuxtUISharedLoaded = false;
    window.__loadedDependencies = new Set();
    window.__loadedTools = new Set();
  </script>
  <script>
    // ── CourseAPI (Preview Adapter) ──────────────────────────────
    ${COURSE_API_PREVIEW_SCRIPT}

    // ── Media Field Helpers ──────────────────────────────────────
    window.getImageUrl = function(imageValue) {
      if (!imageValue || !imageValue.assetId || !imageValue.imageId) return null;
      return '/api/assets/' + imageValue.assetId + '/images/' + imageValue.imageId + '/file';
    };

    window.getVideoInfo = function(videoValue) {
      if (!videoValue || !videoValue.source) return null;
      var isEmbed = videoValue.source === 'youtube' || videoValue.source === 'vimeo';
      if (isEmbed) {
        return { isEmbed: true, embedUrl: videoValue.url, videoUrl: null, thumbnailUrl: null };
      }
      if (!videoValue.assetId || !videoValue.videoId) return null;
      return {
        isEmbed: false,
        embedUrl: null,
        videoUrl: '/api/assets/' + videoValue.assetId + '/videos/' + videoValue.videoId + '/file',
        thumbnailUrl: '/api/assets/' + videoValue.assetId + '/videos/' + videoValue.videoId + '/thumbnail'
      };
    };
  </script>
  <style>
    body { margin: 0; padding: 0; font-family: 'Poppins', system-ui, -apple-system, sans-serif; }
    #app { min-height: 100vh; }
    .preview-error { color: #ef4444; padding: 16px; font-size: 14px; white-space: pre-wrap; font-family: monospace; }
    .preview-empty { display: flex; align-items: center; justify-content: center; height: 100vh; color: #9ca3af; font-size: 14px; }

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

      /* Semantic colors */
      --ui-color-success: #22c55e;
      --ui-color-info: #3b82f6;
      --ui-color-warning: #eab308;
      --ui-color-error: #ef4444;
    }

    /* ── Semantic Design Tokens (Light) ───────────────────────── */
    :root {
      --ui-primary: var(--ui-color-primary-500);
      --ui-text-dimmed: var(--ui-color-neutral-400);
      --ui-text-muted: var(--ui-color-neutral-500);
      --ui-text-toned: var(--ui-color-neutral-600);
      --ui-text: var(--ui-color-neutral-700);
      --ui-text-highlighted: var(--ui-color-neutral-900);
      --ui-text-inverted: #fff;
      --ui-bg: #fff;
      --ui-bg-muted: var(--ui-color-neutral-50);
      --ui-bg-elevated: var(--ui-color-neutral-100);
      --ui-bg-accented: var(--ui-color-neutral-200);
      --ui-bg-inverted: var(--ui-color-neutral-900);
      --ui-border: var(--ui-color-neutral-200);
      --ui-border-muted: var(--ui-color-neutral-200);
      --ui-border-accented: var(--ui-color-neutral-300);
      --ui-border-inverted: var(--ui-color-neutral-900);
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
          borderRadius: { ui: 'var(--ui-radius)' },
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
  </script>
</head>
<body>
  <div id="app"></div>
  <script>
    const { createApp, defineAsyncComponent, reactive, h } = Vue;
    const { loadModule } = window['vue3-sfc-loader'];

    // Resolve the host window: parent (iframe) or opener (popup)
    var hostWindow = window.parent !== window ? window.parent : window.opener;
    function postToHost(msg) { if (hostWindow) hostWindow.postMessage(msg, '*'); }

    let currentApp = null;
    let activityApp = null;
    let depMappings = {};

    // ── Dynamic Script Loading ───────────────────────────────────
    function loadScript(url) {
      return new Promise((resolve, reject) => {
        if (window.__loadedDependencies.has(url)) {
          resolve();
          return;
        }
        const script = document.createElement('script');
        script.src = url;
        script.onload = () => {
          window.__loadedDependencies.add(url);
          resolve();
        };
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }

    async function loadDependencies(deps) {
      if (!deps || !deps.length) return;
      const promises = deps.map(dep => loadScript(dep.url));
      await Promise.all(promises);
    }

    // ── Tool Loading ─────────────────────────────────────────────
    async function loadTools(tools) {
      if (!tools || !tools.length) return;
      for (const tool of tools) {
        if (window.__loadedTools.has(tool.id)) continue;
        
        // Load head HTML (scripts, styles)
        if (tool.headHtml) {
          const container = document.createElement('div');
          container.innerHTML = tool.headHtml;
          for (const child of Array.from(container.children)) {
            document.head.appendChild(child);
          }
        }
        
        // Run setup JS
        if (tool.setupJs) {
          try {
            eval(tool.setupJs);
          } catch (e) {
            console.error('Tool setup error:', tool.id, e);
          }
        }
        
        window.__loadedTools.add(tool.id);
      }
    }

    // ── Nuxt UI Component Loading ────────────────────────────────
    async function loadNuxtUI(nuxtUIInfo) {
      if (!nuxtUIInfo || !nuxtUIInfo.components || !nuxtUIInfo.components.length) {
        console.log('[NuxtUI] No components to load');
        return;
      }
      
      console.log('[NuxtUI] Loading components:', nuxtUIInfo.components);
      
      // Load shared runtime if not already loaded
      if (!window.__nuxtUISharedLoaded) {
        try {
          console.log('[NuxtUI] Loading shared runtime...');
          const sharedModule = await import('/nuxt-ui/shared.js');
          window.__nuxtUISharedLoaded = true;
          
          // Register the internal Icon component (from @iconify/vue) as 'Icon'
          // This is needed because UIcon uses resolveComponent('Icon') internally
          if (sharedModule.f) {
            window.__nuxtUIComponents['Icon'] = sharedModule.f;
            console.log('[NuxtUI] Registered internal Icon component');
          }
          
          console.log('[NuxtUI] Shared runtime loaded');
        } catch (e) {
          console.error('[NuxtUI] Failed to load shared runtime:', e);
          return;
        }
      }

      // Load component modules
      const loadPromises = nuxtUIInfo.components.map(async (name) => {
        if (window.__nuxtUIComponents['U' + name]) return;
        try {
          const mod = await import('/nuxt-ui/components/' + name + '.js');
          if (mod.default) {
            window.__nuxtUIComponents['U' + name] = mod.default;
            console.log('[NuxtUI] Loaded component:', name);
          }
        } catch (e) {
          console.error('[NuxtUI] Failed to load component:', name, e);
        }
      });
      await Promise.all(loadPromises);
      console.log('[NuxtUI] All components loaded:', Object.keys(window.__nuxtUIComponents));

      // Load icons
      if (nuxtUIInfo.icons && nuxtUIInfo.icons.length > 0) {
        const iconPromises = nuxtUIInfo.icons.map(async (iconInfo) => {
          if (window.__nuxtUIIcons[iconInfo.id]) return;
          try {
            const response = await fetch('/api/icons/' + iconInfo.collection + '/' + iconInfo.name);
            if (response.ok) {
              window.__nuxtUIIcons[iconInfo.id] = await response.text();
            }
          } catch (e) {
            console.error('[NuxtUI] Failed to load icon:', iconInfo.id, e);
          }
        });
        await Promise.all(iconPromises);
      }
    }

    // ── SFC Loader ───────────────────────────────────────────────
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

    async function mountComponent(sfcSource, data, slotContent, nuxtUIInfo) {
      // Unmount previous apps
      if (activityApp) { try { activityApp.unmount(); } catch {} activityApp = null; }
      if (currentApp) { try { currentApp.unmount(); } catch {} currentApp = null; }

      const appEl = document.getElementById('app');
      appEl.innerHTML = '';

      if (!sfcSource) {
        appEl.innerHTML = '<div class="preview-empty">No component to preview</div>';
        return;
      }

      try {
        // Wait for any async tool initialization
        if (window.__monacoReady) await window.__monacoReady;

        // Load Nuxt UI components
        console.log('[Preview] Loading Nuxt UI components...');
        await loadNuxtUI(nuxtUIInfo);
        console.log('[Preview] Nuxt UI loaded. Components registered:', Object.keys(window.__nuxtUIComponents || {}));

        // Build moduleCache
        const moduleCache = { vue: Vue };
        for (const [pkg, globalName] of Object.entries(depMappings)) {
          if (window[globalName]) moduleCache[pkg] = window[globalName];
        }

        const mainOptions = makeLoaderOptions(moduleCache, { '/component.vue': sfcSource });
        const MainComp = defineAsyncComponent(() => loadModule('/component.vue', mainOptions));

        // Mount main component
        currentApp = createApp({
          render() { return h(MainComp, { data }); }
        });

        // Register Nuxt UI components
        if (window.__nuxtUIComponents) {
          for (const [name, component] of Object.entries(window.__nuxtUIComponents)) {
            currentApp.component(name, component);
          }
        }

        currentApp.config.errorHandler = (err) => {
          appEl.innerHTML = '<div class="preview-error">Runtime error:\\n' + (err.message || err) + '</div>';
          postToHost({ type: 'preview-error', error: err.message || String(err) });
        };

        console.log('[Preview] Mounting Vue app...');
        currentApp.mount(appEl);
        console.log('[Preview] Vue app mounted');

        // Handle slot content (activity in interface)
        if (slotContent && slotContent.sfc) {
          await new Promise(resolve => setTimeout(resolve, 50));
          const slotEl = document.querySelector('[data-activity-slot]') || document.getElementById('activity-slot');
          if (slotEl) {
            const slotModuleCache = { ...moduleCache };
            if (slotContent.depMappings) {
              for (const [pkg, globalName] of Object.entries(slotContent.depMappings)) {
                if (window[globalName]) slotModuleCache[pkg] = window[globalName];
              }
            }
            const slotOptions = makeLoaderOptions(slotModuleCache, { '/activity.vue': slotContent.sfc });
            const SlotComp = defineAsyncComponent(() => loadModule('/activity.vue', slotOptions));
            slotEl.innerHTML = '';
            activityApp = createApp({
              render() { return h(SlotComp, { data: slotContent.data || {} }); }
            });
            if (window.__nuxtUIComponents) {
              for (const [name, component] of Object.entries(window.__nuxtUIComponents)) {
                activityApp.component(name, component);
              }
            }
            activityApp.config.errorHandler = (err) => {
              slotEl.innerHTML = '<div class="preview-error">Activity error:\\n' + (err.message || err) + '</div>';
            };
            activityApp.mount(slotEl);
            window.dispatchEvent(new CustomEvent('playshape:activity-changed', {
              detail: {
                sectionIndex: 0, activityIndex: 0, activityId: 'preview-activity',
                activityName: slotContent.name || 'Preview Activity', sectionTitle: 'Preview',
                totalActivities: 1, completedActivities: 0, flatIndex: 0
              }
            }));
          }
        }

        console.log('[Preview] Component mounted successfully');
        postToHost({ type: 'preview-mounted' });
      } catch (err) {
        console.error('[Preview] Mount error:', err);
        appEl.innerHTML = '<div class="preview-error">Compile error:\\n' + (err.message || err) + '</div>';
        postToHost({ type: 'preview-error', error: err.message || String(err) });
      }
    }

    // ── Message Handler ──────────────────────────────────────────
    window.addEventListener('message', async (event) => {
      const data = event.data;
      if (!data || !data.type) return;

      if (data.type === 'init') {
        // Initialize with dependencies, tools, and theme
        if (data.dependencies) await loadDependencies(data.dependencies);
        if (data.tools) await loadTools(data.tools);
        if (data.dark !== undefined) {
          document.documentElement.classList.toggle('dark', data.dark);
          document.documentElement.style.colorScheme = data.dark ? 'dark' : 'light';
        }
        postToHost({ type: 'preview-ready' });
      }
      else if (data.type === 'update') {
        if (data.depMappings) depMappings = data.depMappings;
        await mountComponent(data.sfc, data.data || {}, data.slotContent || null, data.nuxtUI || null);
      }
      else if (data.type === 'theme') {
        document.documentElement.classList.toggle('dark', data.dark);
        document.documentElement.style.colorScheme = data.dark ? 'dark' : 'light';
      }
      else if (data.type === 'brand') {
        var brandStyleId = 'brand-override';
        var brandFontId = 'brand-font';
        var existing = document.getElementById(brandStyleId);
        if (data.css) {
          if (existing) { existing.textContent = data.css; }
          else {
            var s = document.createElement('style');
            s.id = brandStyleId;
            s.textContent = data.css;
            document.head.appendChild(s);
          }
        } else if (existing) {
          existing.remove();
        }
        var existingFont = document.getElementById(brandFontId);
        if (data.fontLink) {
          if (existingFont) { existingFont.setAttribute('href', data.fontLink); }
          else {
            var link = document.createElement('link');
            link.id = brandFontId;
            link.rel = 'stylesheet';
            link.href = data.fontLink;
            document.head.appendChild(link);
          }
        } else if (existingFont) {
          existingFont.remove();
        }
      }
    });

    // Signal that we're ready for initialization
    postToHost({ type: 'preview-shell-ready' });
  </script>
</body>
</html>`
})
