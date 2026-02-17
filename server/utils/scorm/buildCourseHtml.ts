/**
 * SCORM Course HTML Generator
 *
 * Generates a self-contained HTML document that runs the course.
 * The HTML includes:
 * - CDN dependencies (Vue 3, Tailwind, vue3-sfc-loader)
 * - Design tokens CSS
 * - SCORM CourseAPI adapter
 * - Navigation bridge for multi-activity courses
 * - Interface template SFC (or default)
 * - All activity SFCs and data inlined
 * - Optional brand CSS overrides
 */

import { generateScormCourseApiScript, generateNavigationBridgeScript, type ScormVersion } from './courseApiScorm'
import { getDefaultInterfaceSfc } from './defaultInterface'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CourseActivity {
  id: string
  name: string
  sfc: string
  data: Record<string, unknown>
  deps?: Array<{ name: string; url: string; global: string }>
}

export interface CourseSection {
  title: string | null
  activities: CourseActivity[]
}

export interface CourseData {
  id: string
  name: string
  sections: CourseSection[]
  interfaceSfc: string | null
  interfaceData: Record<string, unknown>
  interfaceDeps?: Array<{ name: string; url: string; global: string }>
}

export interface BrandData {
  primaryColor: string
  neutralColor: string
  accentColor: string
  fontFamily: string
  fontSource: 'google' | 'system'
  baseFontSize: number
  typeScaleRatio: string
  borderRadius: string
}

export interface BuildHtmlOptions {
  course: CourseData
  scormVersion: ScormVersion
  brand?: BrandData | null
  offline?: boolean
}

// ─── Color Scale Generation (duplicated from app/utils for server-side use) ──

const SHADE_MAP: Array<[string, number, number]> = [
  ['50', 0.97, 0.08],
  ['100', 0.94, 0.12],
  ['200', 0.88, 0.22],
  ['300', 0.78, 0.40],
  ['400', 0.64, 0.70],
  ['500', 0.50, 1.00],
  ['600', 0.40, 1.05],
  ['700', 0.31, 1.00],
  ['800', 0.22, 0.90],
  ['900', 0.13, 0.80],
  ['950', 0.06, 0.70],
]

function hexToHSL(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2

  if (max === min) return [0, 0, l]

  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

  let h = 0
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6

  return [h * 360, s, l]
}

function hslToHex(h: number, s: number, l: number): string {
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }

  h = h / 360
  let r: number, g: number, b: number

  if (s === 0) {
    r = g = b = l
  }
  else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hue2rgb(p, q, h + 1 / 3)
    g = hue2rgb(p, q, h)
    b = hue2rgb(p, q, h - 1 / 3)
  }

  const toHex = (v: number) => {
    const hex = Math.round(Math.min(255, Math.max(0, v * 255))).toString(16)
    return hex.length === 1 ? '0' + hex : hex
  }

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function generateColorScale(hex: string): Record<string, string> {
  const [h, s] = hexToHSL(hex)
  const scale: Record<string, string> = {}

  for (const [shade, targetL, satMul] of SHADE_MAP) {
    const adjustedSat = Math.min(1, s * satMul)
    scale[shade] = hslToHex(h, adjustedSat, targetL)
  }

  return scale
}

// ─── Brand CSS Generation ─────────────────────────────────────────────────────

function generateBrandCSS(brand: BrandData): string {
  const primaryScale = generateColorScale(brand.primaryColor)
  const neutralScale = generateColorScale(brand.neutralColor)
  const accentScale = generateColorScale(brand.accentColor)

  const baseFontSize = brand.baseFontSize
  const ratio = parseFloat(brand.typeScaleRatio)
  const borderRadius = brand.borderRadius

  const headingSizes = Array.from({ length: 6 }, (_, i) => {
    const level = 6 - i
    const size = baseFontSize * Math.pow(ratio, level - 1)
    return `    h${7 - level} { font-size: ${size.toFixed(2)}px; }`
  }).join('\n')

  const fontStack = brand.fontSource === 'system'
    ? `${brand.fontFamily}, system-ui, -apple-system, sans-serif`
    : `'${brand.fontFamily}', system-ui, -apple-system, sans-serif`

  const lines: string[] = [':root {']

  for (const [shade, hex] of Object.entries(primaryScale)) {
    lines.push(`  --ui-color-primary-${shade}: ${hex};`)
  }

  for (const [shade, hex] of Object.entries(neutralScale)) {
    lines.push(`  --ui-color-neutral-${shade}: ${hex};`)
  }

  for (const [shade, hex] of Object.entries(accentScale)) {
    lines.push(`  --ui-color-accent-${shade}: ${hex};`)
  }

  lines.push(`  --ui-radius: ${borderRadius}rem;`)
  lines.push('}')
  lines.push(`body {`)
  lines.push(`  font-family: ${fontStack};`)
  lines.push(`  font-size: ${baseFontSize}px;`)
  lines.push('}')
  lines.push(headingSizes)

  return lines.join('\n')
}

function getBrandFontLink(brand: BrandData): string | null {
  if (brand.fontSource !== 'google') return null
  const encodedFamily = encodeURIComponent(brand.fontFamily)
  return `https://fonts.googleapis.com/css2?family=${encodedFamily}:wght@300;400;500;600;700&display=swap`
}

// ─── Dependency Script Tags ───────────────────────────────────────────────────

function collectDependencies(course: CourseData): Array<{ name: string; url: string; global: string }> {
  const depsMap = new Map<string, { name: string; url: string; global: string }>()

  // Add interface deps
  if (course.interfaceDeps) {
    for (const dep of course.interfaceDeps) {
      depsMap.set(dep.name, dep)
    }
  }

  // Add activity deps
  for (const section of course.sections) {
    for (const activity of section.activities) {
      if (activity.deps) {
        for (const dep of activity.deps) {
          depsMap.set(dep.name, dep)
        }
      }
    }
  }

  return Array.from(depsMap.values())
}

function generateDependencyScriptTags(deps: Array<{ name: string; url: string; global: string }>): string {
  return deps.map(dep => `  <script src="${dep.url}"><\/script>`).join('\n')
}

// ─── Main HTML Generator ──────────────────────────────────────────────────────

export function buildCourseHtml(options: BuildHtmlOptions): string {
  const { course, scormVersion, brand, offline } = options

  // Determine interface SFC
  const interfaceSfc = course.interfaceSfc || getDefaultInterfaceSfc()
  const interfaceData = course.interfaceData || { courseTitle: course.name }

  // Collect all dependencies
  const deps = collectDependencies(course)
  const depScriptTags = generateDependencyScriptTags(deps)

  // Build dependency mappings for vue3-sfc-loader
  const depMappings: Record<string, string> = {}
  for (const dep of deps) {
    depMappings[dep.name] = dep.global
  }

  // Generate SCORM CourseAPI script
  const courseApiScript = generateScormCourseApiScript(scormVersion)

  // Generate navigation bridge script
  const navBridgeScript = generateNavigationBridgeScript()

  // Generate brand CSS if provided
  let brandCss = ''
  let brandFontLink = ''
  if (brand) {
    brandCss = generateBrandCSS(brand)
    const fontLink = getBrandFontLink(brand)
    if (fontLink) {
      brandFontLink = `<link rel="stylesheet" href="${fontLink}">`
    }
  }

  // Build the course data object that will be inlined
  const courseDataObj = {
    id: course.id,
    name: course.name,
    sections: course.sections.map(section => ({
      title: section.title,
      activities: section.activities.map(activity => ({
        id: activity.id,
        name: activity.name,
        sfc: activity.sfc,
        data: activity.data,
        deps: activity.deps || [],
      })),
    })),
    interfaceSfc,
    interfaceData,
    interfaceDeps: course.interfaceDeps || [],
  }

  // Serialize course data as JSON (escaped for safe inclusion in script tags)
  const courseDataJson = escapeJsonForScript(JSON.stringify(courseDataObj))

  // Generate the HTML
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(course.name)}</title>
  ${brandFontLink}
  <script>
    // Suppress Tailwind CDN production warning
    var _origWarn = console.warn;
    console.warn = function() {
      if (typeof arguments[0] === 'string' && arguments[0].indexOf('cdn.tailwindcss.com') !== -1) return;
      _origWarn.apply(console, arguments);
    };
  <\/script>
  <script src="https://cdn.tailwindcss.com"><\/script>
${depScriptTags}
  <script src="https://unpkg.com/vue@3/dist/vue.global.prod.js"><\/script>
  <script src="https://cdn.jsdelivr.net/npm/vue3-sfc-loader@0.9.5/dist/vue3-sfc-loader.js"><\/script>
  <script>
    // ── Course Data ───────────────────────────────────────────────────────────
    window.__PLAYSHAPE_COURSE__ = ${courseDataJson};
  <\/script>
  <script>
    // ── CourseAPI (SCORM Adapter) ─────────────────────────────────────────────
${courseApiScript}
  <\/script>
  <style>
    body { margin: 0; padding: 0; font-family: 'Poppins', system-ui, -apple-system, sans-serif; }
    #app { min-height: 100vh; }
    .preview-error { color: #ef4444; padding: 16px; font-size: 14px; white-space: pre-wrap; font-family: monospace; }

    /*
     * Playshape Design Tokens
     */
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

      /* Semantic color shades */
      --ui-color-success: #22c55e;
      --ui-color-info: #3b82f6;
      --ui-color-warning: #eab308;
      --ui-color-error: #ef4444;
    }

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
${brand ? `  <style id="brand-override">\n${brandCss}\n  </style>` : ''}
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
${navBridgeScript}
  <\/script>
  <script>
    // ── Mount Interface Template ──────────────────────────────────────────────
    (function() {
      var course = window.__PLAYSHAPE_COURSE__;
      var Vue = window.Vue;
      var loadModule = window['vue3-sfc-loader'].loadModule;

      // Build dependency mappings
      var depMappings = ${escapeJsonForScript(JSON.stringify(depMappings))};
      var moduleCache = { vue: Vue };
      for (var pkg in depMappings) {
        if (window[depMappings[pkg]]) {
          moduleCache[pkg] = window[depMappings[pkg]];
        }
      }

      var options = {
        moduleCache: moduleCache,
        getFile: function(url) {
          if (url === '/interface.vue') {
            return Promise.resolve(course.interfaceSfc);
          }
          return fetch(url).then(function(r) {
            return r.ok ? r.text() : Promise.reject(new Error(url + ' ' + r.statusText));
          });
        },
        addStyle: function(textContent) {
          var style = document.createElement('style');
          style.textContent = textContent;
          document.head.appendChild(style);
        }
      };

      var InterfaceComp = Vue.defineAsyncComponent(function() {
        return loadModule('/interface.vue', options);
      });

      var app = Vue.createApp({
        render: function() {
          return Vue.h(InterfaceComp, { data: course.interfaceData || {} });
        }
      });

      app.config.errorHandler = function(err) {
        document.getElementById('app').innerHTML =
          '<div class="preview-error">Error loading interface: ' + (err.message || err) + '</div>';
        console.error('[SCORM] Interface error:', err);
      };

      app.mount('#app');
    })();
  <\/script>
</body>
</html>`
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Escape a JSON string for safe inclusion inside a <script> tag.
 *
 * JSON inside script tags can be broken by:
 * - `</script>` or `</` followed by tag names (closes the script)
 * - `<!--` (starts an HTML comment)
 * - Unicode line terminators (U+2028, U+2029)
 *
 * We escape `<` as `\u003c` and `>` as `\u003e` to prevent all these issues.
 * This is safe because these are valid JSON unicode escapes.
 */
function escapeJsonForScript(json: string): string {
  return json
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}
