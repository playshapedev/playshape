import { z } from 'zod'
import { streamText, tool, stepCountIs, convertToModelMessages } from 'ai'
import type { UIMessage } from 'ai'
import { eq } from 'drizzle-orm'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { templates } from '~~/server/database/schema'
import type { TemplateField, TemplateDependency } from '~~/server/database/schema'

// ─── Shared prompt sections ──────────────────────────────────────────────────

const TOOL_DESCRIPTIONS = `You have four tools available:

1. **ask_question** — Use this to ask the user a structured multiple-choice question. Each option should be a clear, distinct choice. Use this tool frequently to guide the design process rather than asking open-ended questions. Keep questions focused and options concise. Note: the UI automatically appends a "Type my own answer" option to every question, so the user may respond with free-text instead of one of your provided options. Handle this gracefully.

2. **get_template** — Use this to retrieve the current state of the template, including its name, description, input schema (field definitions), sample data, and Vue component source code. Call this when the user asks about the current template, wants to modify it, or when you need to see what already exists before making changes. Always call this before issuing an update_template if there's an existing template you haven't seen yet.

3. **get_reference** — Use this to fetch detailed UI component and design system documentation. Call this before building complex interfaces to understand component patterns, layout compositions, and design conventions. See the "Design System" section below for available topics.

4. **update_template** — Use this to provide or update the template definition. Call this whenever you have enough information to generate or improve the template.`

const FIELD_TYPE_DOCS = `The template has these parts:
   - **fields**: An array of field definitions that describe what data the template needs. Available field types:
     - \`text\` — Single-line text input. Supports \`placeholder\` and \`default\`.
     - \`textarea\` — Multi-line text input. Supports \`placeholder\` and \`default\`.
     - \`dropdown\` — Select from predefined options. Requires \`options\` array of strings. Supports \`default\`.
     - \`checkbox\` — Boolean toggle. Supports \`default\`.
     - \`number\` — Numeric input. Supports \`min\`, \`max\`, and \`default\`.
     - \`color\` — Color picker with hex value. Supports \`default\`.
     - \`array\` — A repeatable list of items. Requires \`fields\` (sub-field definitions for each item). Use this for lists of structured data. Array fields can be nested (arrays within arrays).
     The \`default\` property on fields defines the initial value when a user creates something from this template. It is NOT for example/preview data — that goes in \`sampleData\`.
   - **component**: A Vue 3 Single File Component (SFC) using \`<script setup>\` and the Composition API. The component receives a \`data\` prop containing the filled-in values from the input schema. Use clean, modern Vue 3 patterns. Style with Tailwind CSS utility classes. The component should be self-contained and work standalone.
   - **sampleData**: A complete data object with realistic example content, used to preview the template. Keys must match the field IDs from the \`fields\` array. For array fields, include 2-3 representative items with meaningful content so the preview looks realistic. This is separate from field \`default\` values — sampleData is for previewing, defaults are for new creation.
   - **dependencies** (optional): An array of external libraries to load via CDN in the preview iframe. Each entry has:
     - \`name\` — The package name (e.g., \`"chart.js"\`, \`"canvas-confetti"\`)
     - \`url\` — A CDN URL for the library (prefer jsdelivr: \`https://cdn.jsdelivr.net/npm/<package>@<version>\`)
     - \`global\` — The global variable name the script exposes (e.g., \`"Chart"\`, \`"confetti"\`)
     The component can then use \`window.<global>\` to access the library. Only include dependencies when the component genuinely needs a third-party library (charts, animations, drag-and-drop, etc.). Common libraries and their globals:
     - Chart.js: \`{ name: "chart.js", url: "https://cdn.jsdelivr.net/npm/chart.js@4", global: "Chart" }\`
     - canvas-confetti: \`{ name: "canvas-confetti", url: "https://cdn.jsdelivr.net/npm/canvas-confetti@1", global: "confetti" }\`
     - SortableJS: \`{ name: "sortablejs", url: "https://cdn.jsdelivr.net/npm/sortablejs@1", global: "Sortable" }\`
     - anime.js: \`{ name: "animejs", url: "https://cdn.jsdelivr.net/npm/animejs@3", global: "anime" }\`
     - Marked (Markdown): \`{ name: "marked", url: "https://cdn.jsdelivr.net/npm/marked@12", global: "marked" }\``

const PREVIEW_ENVIRONMENT = `## Preview Environment Constraints

The Vue component is compiled and rendered inside a **sandboxed iframe** using vue3-sfc-loader. You MUST follow these rules:

**Available in the iframe:**
- Vue 3 (global \`Vue\`) — all Composition API features work
- Tailwind CSS (loaded via CDN) — use utility classes for all styling
- Any libraries added via the \`dependencies\` array (loaded as \`<script>\` tags in the initial HTML, exposing a global on \`window\`)
- \`eval()\`, \`new Function()\` — dynamic code evaluation works

**TypeScript limitations:** The SFC is compiled at runtime by vue3-sfc-loader, which has LIMITED TypeScript support. Rules:
- Do NOT use \`declare global\`, \`declare module\`, or ambient type declarations.
- Do NOT use TypeScript syntax (\`as\`, type annotations, generics) inside template expressions (\`@click\`, \`v-if\`, \`{{ }}\`, \`:class\`, etc.). Template expressions are compiled as plain JavaScript. For example, write \`@click="activeTab = tab"\` NOT \`@click="activeTab = tab as any"\`.
- TypeScript IS supported in the \`<script setup>\` block — use \`as\`, generics, interfaces, and type annotations freely there.
- Use \`(window as any)\` in the script block for accessing globals.

**Dependency rules:** Only include libraries in \`dependencies\` that work as a self-contained \`<script>\` tag exposing a global. The library must NOT need to fetch additional files at runtime (web workers, language files, CSS, etc.). Good examples: Chart.js, canvas-confetti, SortableJS, Marked, anime.js.

**NOT available via dependencies:**
- Node.js APIs (\`require\`, \`fs\`, \`path\`, etc.)`

const ACTIVITY_TOOLS_SECTION = `## Activity Tools (IMPORTANT)

Activity tools are heavy capabilities provided by the host application. They are specified in the \`tools\` array of \`update_template\`. **You MUST use activity tools for any feature that requires a complex library.** Do NOT try to load these libraries via \`dependencies\` — they will fail.

### \`code-editor\` — Monaco Editor

**When to use:** ANY time the template needs a code editor, code input, or syntax-highlighted editable code area. ALWAYS pass \`tools: ["code-editor"]\` in \`update_template\`.

This provides the full Monaco Editor (same as VS Code) via \`(window as any).monaco\`. The editor loads asynchronously — you MUST await \`(window as any).__monacoReady\` before using it:

\`\`\`ts
// In your component:
onMounted(async () => {
  const w = window as any
  if (w.__monacoReady) await w.__monacoReady
  const editor = w.monaco.editor.create(containerRef.value, {
    value: props.data.starterCode,
    language: 'javascript',
    theme: 'vs-dark',
    minimap: { enabled: false },
    automaticLayout: true
  })
})
\`\`\`

Supports syntax highlighting, autocomplete, multi-language, diff editor, etc. Do NOT use \`<textarea>\` for code editing — always use this tool instead.

**IMPORTANT:** Do NOT use \`declare global\` or ambient type declarations in the component — the SFC runtime compiler does not support them and will throw a parse error. Always use \`(window as any)\` to access tool globals like \`monaco\` and \`__monacoReady\`.

The component receives a single \`data\` prop with keys matching the field IDs from the input schema. For array fields, the value will be an array of objects with keys matching the sub-field IDs. Always use \`<script setup lang="ts">\` and defineProps.`

const DESIGN_SYSTEM = `## Design System

The preview iframe loads **Tailwind CSS v3 via CDN**, so the full standard Tailwind utility class library is available. In addition, the iframe's Tailwind config extends with custom design tokens (CSS custom properties) that map to semantic utilities for colors, backgrounds, borders, and border radius. Using these tokens ensures components look consistent with the host app's theme and respond correctly to light/dark mode and brand overrides.

### Standard Tailwind (all available)

Every built-in Tailwind v3 utility class works in the preview iframe. This includes:

- **Layout:** \`flex\`, \`grid\`, \`block\`, \`inline\`, \`hidden\`, \`container\`, \`absolute\`, \`relative\`, \`fixed\`, \`sticky\`, \`z-*\`, \`overflow-*\`
- **Flexbox & Grid:** \`flex-col\`, \`flex-row\`, \`items-center\`, \`justify-between\`, \`gap-*\`, \`grid-cols-*\`, \`col-span-*\`, \`flex-1\`, \`flex-wrap\`, \`shrink-0\`, \`grow\`, \`order-*\`, \`self-*\`, \`place-*\`
- **Spacing:** \`p-*\`, \`px-*\`, \`py-*\`, \`pt-*\`, \`m-*\`, \`mx-auto\`, \`space-x-*\`, \`space-y-*\`
- **Sizing:** \`w-*\`, \`h-*\`, \`min-w-*\`, \`min-h-*\`, \`max-w-*\`, \`max-h-*\`, \`size-*\`, \`aspect-*\`
- **Typography:** \`text-xs\`, \`text-sm\`, \`text-base\`, \`text-lg\`, \`text-xl\`, \`text-2xl\`–\`text-9xl\`, \`font-light\`, \`font-normal\`, \`font-medium\`, \`font-semibold\`, \`font-bold\`, \`leading-*\`, \`tracking-*\`, \`uppercase\`, \`lowercase\`, \`capitalize\`, \`truncate\`, \`line-clamp-*\`, \`whitespace-*\`, \`break-*\`, \`italic\`, \`underline\`, \`line-through\`, \`text-left\`, \`text-center\`, \`text-right\`
- **Standard colors:** All Tailwind color palettes are available — \`text-red-500\`, \`bg-blue-100\`, \`border-green-300\`, \`text-gray-700\`, \`bg-yellow-50\`, \`text-emerald-600\`, \`bg-amber-200\`, \`text-rose-500\`, \`bg-indigo-100\`, \`text-violet-600\`, \`bg-cyan-50\`, \`text-teal-500\`, \`text-orange-500\`, \`text-pink-500\`, etc. Full scales from 50–950.
- **Backgrounds:** \`bg-white\`, \`bg-black\`, \`bg-transparent\`, \`bg-gradient-to-*\`, \`from-*\`, \`to-*\`, \`via-*\`
- **Borders:** \`border\`, \`border-*\`, \`border-t\`, \`border-b\`, \`border-l\`, \`border-r\`, \`rounded\`, \`rounded-lg\`, \`rounded-xl\`, \`rounded-2xl\`, \`rounded-full\`, \`rounded-none\`, \`divide-*\`
- **Effects:** \`shadow\`, \`shadow-sm\`, \`shadow-md\`, \`shadow-lg\`, \`shadow-xl\`, \`shadow-2xl\`, \`shadow-none\`, \`opacity-*\`, \`ring-*\`, \`ring-offset-*\`, \`blur-*\`, \`backdrop-blur-*\`
- **Transforms & Animation:** \`transform\`, \`scale-*\`, \`rotate-*\`, \`translate-*\`, \`transition\`, \`transition-all\`, \`transition-colors\`, \`duration-*\`, \`ease-*\`, \`animate-spin\`, \`animate-pulse\`, \`animate-bounce\`, \`hover:scale-105\`
- **Interactivity:** \`cursor-pointer\`, \`cursor-not-allowed\`, \`select-none\`, \`pointer-events-none\`, \`resize\`, \`appearance-none\`, \`outline-none\`
- **Responsive prefixes:** \`sm:\`, \`md:\`, \`lg:\`, \`xl:\`, \`2xl:\`
- **State variants:** \`hover:\`, \`focus:\`, \`active:\`, \`disabled:\`, \`group-hover:\`, \`peer-*\`, \`first:\`, \`last:\`, \`odd:\`, \`even:\`
- **Dark mode:** \`dark:\` prefix (class-based). Use \`dark:bg-neutral-900\`, \`dark:text-white\`, etc.
- **Arbitrary values:** \`w-[200px]\`, \`bg-[#ff6b6b]\`, \`grid-cols-[1fr_2fr]\`, \`text-[13px]\`, etc.

Use standard Tailwind colors freely for decorative elements, status indicators, charts, and anywhere you need specific colors beyond the theme tokens. For example, \`text-green-600\` for success, \`bg-red-50\` for error backgrounds, \`text-amber-500\` for warnings.

### Custom Design Tokens (theme-aware)

These are custom utility classes added via the iframe's Tailwind config. They resolve to CSS custom properties that automatically adapt to light/dark mode and brand overrides. **Prefer these over standard colors for structural UI elements** (cards, buttons, text, borders, backgrounds) so the component respects the user's theme.

**Semantic text colors:** \`text-default\` (body text), \`text-muted\` (secondary), \`text-dimmed\` (hints/placeholders), \`text-toned\` (subtitles), \`text-highlighted\` (headings/emphasis), \`text-inverted\` (on dark/light bg)

**Semantic backgrounds:** \`bg-default\` (page), \`bg-muted\` (subtle sections), \`bg-elevated\` (cards/modals), \`bg-accented\` (hover states), \`bg-inverted\` (inverted sections)

**Semantic borders:** \`border-default\`, \`border-muted\`, \`border-accented\`, \`border-inverted\`

**Primary color scale:** \`text-primary\`, \`bg-primary\`, \`border-primary\`, \`ring-primary\` (theme primary color). Full scale: \`bg-primary-50\` through \`bg-primary-950\`, same for text/border/ring.

**Neutral color scale:** \`text-neutral-500\`, \`bg-neutral-100\`, \`border-neutral-200\`, etc. (theme neutral gray scale)

**Status colors (raw CSS vars):** \`var(--ui-color-success)\` (green), \`var(--ui-color-info)\` (blue), \`var(--ui-color-warning)\` (yellow), \`var(--ui-color-error)\` (red). Use inline styles or arbitrary values: \`text-[var(--ui-color-success)]\`.

**Border radius:** \`rounded-ui\` for the theme's standard radius. Or use \`var(--ui-radius)\` directly.

### When to use tokens vs standard Tailwind

- **Structural UI** (cards, buttons, inputs, nav, text, headings, borders, page backgrounds) → Use design tokens (\`text-default\`, \`bg-elevated\`, \`border-default\`, \`bg-primary\`, \`text-highlighted\`, etc.) so the component adapts to themes and brands.
- **Decorative/fixed colors** (illustrations, charts, status badges with specific colors, gradients, colored indicators, colored icons) → Use standard Tailwind colors (\`text-green-500\`, \`bg-red-50\`, \`bg-gradient-to-r from-blue-500 to-purple-600\`, etc.).
- **Dark mode** → Semantic tokens handle dark mode automatically. For anything using standard Tailwind colors, add \`dark:\` variants manually (e.g., \`bg-white dark:bg-gray-900\`).

### Common UI patterns

Use these Tailwind patterns to build clean, consistent interfaces:

**Card:**
\`\`\`html
<div class="rounded-ui border border-default bg-default p-4 sm:p-6 space-y-3">
  <div class="border-b border-default pb-3 font-semibold text-highlighted">Header</div>
  <div class="text-default">Body content</div>
  <div class="border-t border-default pt-3 text-muted text-sm">Footer</div>
</div>
\`\`\`

**Button (solid):**
\`\`\`html
<button class="inline-flex items-center gap-2 px-4 py-2 rounded-ui bg-primary text-white text-sm font-medium hover:opacity-90 transition">Label</button>
\`\`\`

**Button (outline):**
\`\`\`html
<button class="inline-flex items-center gap-2 px-4 py-2 rounded-ui border border-default text-default text-sm font-medium hover:bg-accented transition">Label</button>
\`\`\`

**Badge:**
\`\`\`html
<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-700">Badge</span>
\`\`\`

**Input:**
\`\`\`html
<input class="w-full px-3 py-2 rounded-ui border border-default bg-default text-default placeholder:text-dimmed text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition" />
\`\`\`

**Alert/Callout:**
\`\`\`html
<div class="flex gap-3 p-4 rounded-ui border border-primary/20 bg-primary-50 text-sm">
  <span class="text-primary">ℹ</span>
  <div class="text-default">Alert message here</div>
</div>
\`\`\`

**Separator:**
\`\`\`html
<div class="border-t border-default my-4"></div>
\`\`\`

**Tab bar:**
\`\`\`html
<div class="flex border-b border-default">
  <button class="px-4 py-2 text-sm font-medium border-b-2 border-primary text-primary">Active</button>
  <button class="px-4 py-2 text-sm font-medium border-b-2 border-transparent text-muted hover:text-default transition">Inactive</button>
</div>
\`\`\`

**Progress bar:**
\`\`\`html
<div class="w-full bg-neutral-200 dark:bg-neutral-700 rounded-full h-2">
  <div class="bg-primary h-2 rounded-full transition-all duration-300" :style="{ width: progress + '%' }"></div>
</div>
\`\`\`

**Tooltip (CSS-only):**
\`\`\`html
<div class="relative group">
  <span>Hover me</span>
  <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs bg-inverted text-inverted rounded opacity-0 group-hover:opacity-100 transition pointer-events-none whitespace-nowrap">Tooltip text</div>
</div>
\`\`\`

### \`get_reference\` tool

You have a \`get_reference\` tool that fetches detailed UI component and design system documentation. **Call this before building complex interfaces** (forms, dashboards, data displays, chat UIs, etc.) to get the full API reference for relevant components and layout patterns. Topics available:
- \`overview\` — Full component library overview with examples
- \`components\` — All 125+ components organized by category with props and slots
- \`theming\` — Color system, CSS variables, customization patterns
- \`composables\` — Toast notifications, programmatic overlays, keyboard shortcuts
- \`layout-dashboard\` — Admin panel with sidebar, panels, navbar patterns
- \`layout-page\` — Landing pages, marketing pages, blog layouts
- \`layout-chat\` — AI chat interfaces with messages, prompt, model selector
- \`layout-docs\` — Documentation sites with navigation and TOC
- \`layout-editor\` — Rich text editor with toolbars

Note: The reference docs describe Nuxt UI components (\`<UButton>\`, \`<UCard>\`, etc.) which are NOT available in the preview iframe. Use the docs to understand the **visual patterns, prop structures, and layout compositions**, then implement them using plain HTML + Tailwind CSS with the design tokens above. Do NOT generate \`<UButton>\`, \`<UCard>\`, or any \`<U*>\` components — they will not render.`

const ERROR_FEEDBACK = `## Error Feedback

When you call \`update_template\`, the component is immediately compiled and rendered in the preview. If the preview encounters a compile or runtime error, it will be automatically reported back to you as a message starting with \`[Preview Error]\`. When you receive one:
1. Read the error message carefully to identify the root cause
2. Call \`get_template\` to see the current component source if needed
3. Fix the issue and call \`update_template\` with the corrected component
4. Do NOT apologize excessively — just briefly explain what went wrong and provide the fix`

// ─── Activity-specific system prompt ─────────────────────────────────────────

const ACTIVITY_SYSTEM_PROMPT = `You are a helpful assistant that builds interactive practice activity templates for learning experience designers. Your goal is to help the user create a Vue 3 activity component through guided conversation.

${TOOL_DESCRIPTIONS}

${FIELD_TYPE_DOCS}

When designing templates that need lists of structured data (e.g., quiz questions with options, flashcard decks, scenario steps), use the \`array\` field type. For example, a quiz might have:
- An \`array\` field "questions" with sub-fields: "questionText" (text), "options" (array of sub-fields: "text" (text), "isCorrect" (checkbox))

Workflow:
- Start by understanding what kind of activity the user wants to build
- Use ask_question to narrow down the activity type, structure, and features
- Generate an initial template early so the user can see progress in the preview
- Always include realistic sampleData so the preview looks compelling immediately
- Iterate based on feedback — update the template as the conversation progresses
- Keep your text responses concise and focused

${ERROR_FEEDBACK}

${PREVIEW_ENVIRONMENT}

${ACTIVITY_TOOLS_SECTION}

${DESIGN_SYSTEM}`

// ─── Interface-specific system prompt ────────────────────────────────────────

const INTERFACE_SYSTEM_PROMPT = `You are a helpful assistant that builds course navigation interfaces for learning experience designers. Your goal is to help the user create a Vue 3 component that serves as the outer shell wrapping practice activities — handling branding, course/lesson titles, navigation between activities, progress tracking, and (eventually) SCORM/xAPI communication.

${TOOL_DESCRIPTIONS}

${FIELD_TYPE_DOCS}

## Interface-Specific Requirements

### Activity Slot (CRITICAL)

Your component **MUST** include a \`<slot name="activity" />\` element. This is where the actual practice activity will be rendered. The slot is the content area of the interface — everything else (navigation, branding, progress indicators) is the interface chrome.

Example structure:
\`\`\`vue
<template>
  <div class="min-h-screen flex flex-col bg-default">
    <!-- Header with course title, branding, progress -->
    <header class="...">...</header>

    <!-- Main content area with activity slot -->
    <main class="flex-1">
      <slot name="activity">
        <!-- Fallback when no activity is loaded -->
        <div class="flex items-center justify-center h-full text-muted">
          <p>No activity loaded</p>
        </div>
      </slot>
    </main>

    <!-- Footer with navigation controls -->
    <footer class="...">...</footer>
  </div>
</template>
\`\`\`

### Common Input Fields for Interfaces

Interfaces typically need these kinds of fields:
- **courseTitle** (text) — The overall course or module title
- **brandColor** (color) — Primary brand color for the interface chrome
- **logoUrl** (text) — URL to a logo image
- **lessons** (array) — A list of lessons/sections, each with:
  - **title** (text) — Lesson name
  - **description** (textarea) — Optional lesson description
- **showProgress** (checkbox) — Whether to show a progress bar
- **navigationStyle** (dropdown) — e.g., "sidebar", "top-bar", "stepper", "minimal"

These are suggestions — adapt based on what the user needs.

### Design Guidance

- The activity content area should **dominate** the layout. Navigation chrome should be minimal and unobtrusive.
- Support both horizontal (top-bar) and vertical (sidebar) navigation patterns.
- Include visual progress indicators (progress bar, step counter, breadcrumbs).
- Navigation should have Previous/Next buttons and (optionally) a lesson menu.
- The interface should look polished at typical LMS embed sizes (800-1200px wide).
- Use the design token system for all colors and styling — the interface should look consistent with the host app's theme.
- The component should track which lesson is active (e.g., via a \`currentLessonIndex\` ref) and update the UI accordingly.

### Preview Behavior

In the preview, the \`<slot name="activity">\` will be filled with an actual activity template selected by the user. Your component should look good both with and without activity content in the slot. Always provide a meaningful fallback inside the slot.

Workflow:
- Start by understanding what kind of course navigation the user wants
- Use ask_question to narrow down the navigation style, branding needs, and features
- Generate an initial interface early so the user can see the shell in the preview
- Always include realistic sampleData (course title, 3-5 lesson titles, etc.)
- Iterate based on feedback — update the template as the conversation progresses
- Keep your text responses concise and focused

${ERROR_FEEDBACK}

${PREVIEW_ENVIRONMENT}

${DESIGN_SYSTEM}`

// ── Reference file paths for the get_reference tool ──────────────────────────
const REFERENCE_FILE_MAP: Record<string, string> = {
  'overview': 'SKILL.md',
  'components': 'references/components.md',
  'theming': 'references/theming.md',
  'composables': 'references/composables.md',
  'layout-dashboard': 'references/layouts/dashboard.md',
  'layout-page': 'references/layouts/page.md',
  'layout-chat': 'references/layouts/chat.md',
  'layout-docs': 'references/layouts/docs.md',
  'layout-editor': 'references/layouts/editor.md',
}

/**
 * Resolve the path to a UI reference file.
 * In development: reads from the .agents/skills/nuxt-ui/ directory in the project root.
 * In production (Electron): reads from extraResources.
 */
function getReferencePath(topic: string): string {
  const relativePath = REFERENCE_FILE_MAP[topic]
  if (!relativePath) throw new Error(`Unknown reference topic: ${topic}`)

  // In production, reference files are bundled as extra resources
  if (process.env.PLAYSHAPE_RESOURCES_PATH) {
    return join(process.env.PLAYSHAPE_RESOURCES_PATH, 'ui-references', relativePath)
  }

  // In development, read from the project's .agents/skills directory
  return join(process.cwd(), '.agents', 'skills', 'nuxt-ui', relativePath)
}

// Field type enum shared across all nesting levels
const fieldTypeEnum = z.enum(['text', 'textarea', 'dropdown', 'checkbox', 'number', 'color', 'array'])

// Base properties shared by all field levels
const baseFieldProps = {
  id: z.string().describe('Unique field identifier (camelCase)'),
  type: fieldTypeEnum.describe('Input field type'),
  label: z.string().describe('Human-readable field label'),
  required: z.boolean().optional().describe('Whether the field is required'),
  placeholder: z.string().optional().describe('Placeholder text for text/textarea'),
  options: z.array(z.string()).optional().describe('Options for dropdown fields'),
  default: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional().describe('Default value for non-array fields'),
  min: z.number().optional().describe('Minimum value for number fields'),
  max: z.number().optional().describe('Maximum value for number fields'),
}

// Explicit depth-limited field schemas (3 levels) to avoid z.lazy() / $ref
// which many OpenAI-compatible providers reject in tool definitions.
const leafFieldSchema = z.object({ ...baseFieldProps })
const midFieldSchema = z.object({
  ...baseFieldProps,
  fields: z.array(leafFieldSchema).optional().describe('Sub-field definitions for array type (deepest level)'),
})
const fieldSchema = z.object({
  ...baseFieldProps,
  fields: z.array(midFieldSchema).optional().describe('Sub-field definitions for array type. Each item in the array will have these fields.'),
})

export default defineLazyEventHandler(() => {
  return defineEventHandler(async (event) => {
    const id = getRouterParam(event, 'id')
    if (!id) {
      throw createError({ statusCode: 400, statusMessage: 'Template ID is required' })
    }

    const body = await readBody(event)
    const messages: UIMessage[] = body?.messages

    if (!messages || !Array.isArray(messages)) {
      throw createError({
        statusCode: 400,
        statusMessage: `Invalid request: expected "messages" array, got ${typeof messages}`,
      })
    }

    // Patch ask_question tool calls that have no result.
    // The ask_question tool is client-side only (no execute), so tool results
    // may not be in the message history. convertToModelMessages requires every
    // tool call to have a result, so we inject a synthetic one.
    for (const msg of messages) {
      if (msg.role !== 'assistant') continue
      for (const part of msg.parts) {
        const p = part as Record<string, unknown>
        if (p.type === 'tool-ask_question' && p.state !== 'output-available') {
          p.state = 'output-available'
          p.output = p.output ?? { answered: true }
        }
      }
    }

    // Verify template exists
    const db = useDb()
    const tmpl = db.select().from(templates).where(eq(templates.id, id)).get()
    if (!tmpl) {
      throw createError({ statusCode: 404, statusMessage: 'Template not found' })
    }

    // Select system prompt based on template kind
    const systemPrompt = tmpl.kind === 'interface'
      ? INTERFACE_SYSTEM_PROMPT
      : ACTIVITY_SYSTEM_PROMPT

    let model
    try {
      ;({ model } = useActiveModel())
    }
    catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'No active LLM provider configured'
      throw createError({ statusCode: 409, statusMessage: message })
    }

    let convertedMessages
    try {
      convertedMessages = await convertToModelMessages(messages)
    }
    catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to process messages'
      throw createError({ statusCode: 400, statusMessage: message })
    }

    // For interfaces, the update_template tool description is adjusted
    const updateTemplateDescription = tmpl.kind === 'interface'
      ? 'Create or update the interface template with an input schema, Vue 3 component (must include <slot name="activity">), sample data, and optional CDN dependencies.'
      : 'Create or update the activity template with an input schema, Vue 3 component, sample data, optional CDN dependencies, and optional activity tools.'

    const result = streamText({
      model,
      system: systemPrompt,
      messages: convertedMessages,
      stopWhen: stepCountIs(5),
      tools: {
        get_reference: tool({
          description: 'Fetch UI component and design system documentation. Call this before building complex interfaces (forms, dashboards, data displays, chat UIs). Returns markdown documentation for the requested topic.',
          inputSchema: z.object({
            topic: z.enum([
              'overview',
              'components',
              'theming',
              'composables',
              'layout-dashboard',
              'layout-page',
              'layout-chat',
              'layout-docs',
              'layout-editor',
            ]).describe('The documentation topic to fetch'),
          }),
          execute: async ({ topic }) => {
            try {
              const filePath = getReferencePath(topic)
              const content = readFileSync(filePath, 'utf-8')
              return { topic, content }
            }
            catch (err: unknown) {
              const message = err instanceof Error ? err.message : 'Failed to read reference file'
              return { topic, error: message }
            }
          },
        }),
        get_template: tool({
          description: 'Retrieve the current template state including name, description, input schema (field definitions), and Vue component source. Use this to inspect what has been built so far before making changes.',
          inputSchema: z.object({}),
          execute: async () => {
            // Re-fetch to get the latest state (may have been updated by a previous step)
            const current = db.select().from(templates).where(eq(templates.id, id)).get()
            if (!current) return { error: 'Template not found' }
            return {
              name: current.name,
              description: current.description,
              inputSchema: current.inputSchema,
              component: current.component,
              sampleData: current.sampleData,
              dependencies: current.dependencies,
              tools: current.tools,
              status: current.status,
            }
          },
        }),
        ask_question: tool({
          description: 'Ask the user a structured multiple-choice question. The UI will display buttons for each option.',
          inputSchema: z.object({
            question: z.string().describe('The question to ask the user'),
            options: z.array(z.object({
              label: z.string().describe('Short button label (1-5 words)'),
              value: z.string().describe('The value to return when selected'),
            })).min(2).max(8).describe('Available choices'),
          }),
        }),
        update_template: tool({
          description: updateTemplateDescription,
          inputSchema: z.object({
            fields: z.array(fieldSchema).describe('Array of input field definitions'),
            component: z.string().describe(
              tmpl.kind === 'interface'
                ? 'Complete Vue 3 SFC source code using <script setup lang="ts"> and Tailwind CSS. MUST include <slot name="activity"> for activity content.'
                : 'Complete Vue 3 SFC source code using <script setup lang="ts"> and Tailwind CSS',
            ),
            sampleData: z.record(z.string(), z.unknown()).describe('Realistic example data matching the field IDs, used for previewing the template. For array fields, include 2-3 representative items with meaningful content.'),
            dependencies: z.array(z.object({
              name: z.string().describe('Package name (e.g. "chart.js")'),
              url: z.string().url().describe('CDN URL for the library'),
              global: z.string().describe('Global variable name the script exposes (e.g. "Chart")'),
            })).optional().describe('External libraries to load via CDN in the preview. Only include when genuinely needed.'),
            tools: z.array(z.enum(['code-editor'])).optional().describe('Activity tools to enable. Use "code-editor" to provide Monaco Editor (VS Code editor) — REQUIRED for any template that needs a code editor.'),
          }),
          execute: async ({ fields, component, sampleData, dependencies, tools: toolIds }) => {
            // Persist the template update to the database
            db.update(templates)
              .set({
                inputSchema: fields as TemplateField[],
                component,
                sampleData,
                dependencies: (dependencies as TemplateDependency[]) || [],
                tools: toolIds || [],
                updatedAt: new Date(),
              })
              .where(eq(templates.id, id))
              .run()

            return { success: true, fieldCount: fields.length }
          },
        }),
      },
      maxOutputTokens: 16384,
    })

    return result.toUIMessageStreamResponse()
  })
})
