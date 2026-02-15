/**
 * Activity Tools are heavy, pre-built capabilities provided by the host
 * application to template preview iframes. Unlike `dependencies` (CDN
 * scripts loaded inside the iframe), activity tools are loaded by the parent
 * and may require web workers, dynamic imports, or other features that only
 * work when the iframe shares the parent's origin (allow-same-origin).
 *
 * Each tool declares:
 * - `id` — unique string identifier the LLM references
 * - `label` — human-readable name
 * - `description` — what the tool provides (included in LLM system prompt)
 * - `scripts` — CDN script URLs loaded as <script> tags in the iframe <head>
 * - `styles` — CDN stylesheet URLs loaded as <link> tags in the iframe <head>
 * - `setup` — JavaScript code injected into the iframe's inline script,
 *   executed after all scripts have loaded. Used to configure the tool
 *   (e.g., disable Monaco's worker loading and set up MonacoEnvironment).
 * - `global` — the global variable name the tool exposes (e.g., "monaco")
 */

export interface ActivityTool {
  id: string
  label: string
  description: string
  scripts: string[]
  styles: string[]
  setup: string
  global: string
}

/**
 * Registry of all available activity tools.
 * Add new tools here — the system prompt and preview infrastructure
 * will automatically pick them up.
 */
const ACTIVITY_TOOLS: ActivityTool[] = [
  {
    id: 'code-editor',
    label: 'Code Editor (Monaco)',
    description: 'Provides the Monaco Editor (same editor as VS Code) via `window.monaco`. Supports syntax highlighting, autocomplete, and multi-language editing. Use `window.monaco.editor.create(element, options)` to create an editor instance.',
    global: 'monaco',
    scripts: [
      'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs/loader.js',
    ],
    styles: [],
    // Configure Monaco to load workers from the CDN instead of trying to
    // use relative paths (which would fail). The MonacoEnvironment.getWorkerUrl
    // approach uses data URIs that importScripts from the CDN.
    setup: `
      window.MonacoEnvironment = {
        getWorkerUrl: function (moduleId, label) {
          var base = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min';
          // The worker uses AMD require with relative paths (e.g. ../../../vs/language/typescript/tsWorker).
          // In a blob: URL context these relative fetches fail because there is no base path.
          // Fix: set self.MonacoEnvironment.baseUrl inside the worker before loading workerMain.js
          // so the AMD loader resolves modules against the CDN, not the blob origin.
          var workerCode = [
            'self.MonacoEnvironment = { baseUrl: "' + base + '/" };',
            'importScripts("' + base + '/vs/base/worker/workerMain.js");'
          ].join('\\n');
          var blob = new Blob([workerCode], { type: 'application/javascript' });
          return URL.createObjectURL(blob);
        }
      };
      // Load Monaco via its AMD loader
      window.require.config({
        paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs' }
      });
      window.__monacoReady = new Promise(function (resolve) {
        window.require(['vs/editor/editor.main'], function () {
          resolve(window.monaco);
        });
      });
    `,
  },
]

/**
 * Returns the full list of available activity tools.
 */
export function useActivityTools() {
  /**
   * Look up tools by their IDs.
   * Returns only the tools that match, in the order requested.
   */
  function getTools(ids: string[]): ActivityTool[] {
    return ids
      .map(id => ACTIVITY_TOOLS.find(t => t.id === id))
      .filter((t): t is ActivityTool => !!t)
  }

  /**
   * Build the <head> HTML for all requested tools (script + style tags).
   */
  function getToolHeadHtml(ids: string[]): string {
    const tools = getTools(ids)
    const parts: string[] = []
    for (const tool of tools) {
      for (const url of tool.styles) {
        parts.push(`  <link rel="stylesheet" href="${url}">`)
      }
      for (const url of tool.scripts) {
        parts.push(`  <script src="${url}"><\/script>`)
      }
    }
    return parts.join('\n')
  }

  /**
   * Build the setup JavaScript for all requested tools.
   * This code runs inside the iframe after all <script> tags have loaded.
   */
  function getToolSetupJs(ids: string[]): string {
    const tools = getTools(ids)
    return tools.map(t => t.setup).filter(Boolean).join('\n')
  }

  return {
    tools: ACTIVITY_TOOLS,
    getTools,
    getToolHeadHtml,
    getToolSetupJs,
  }
}
