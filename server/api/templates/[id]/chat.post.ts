import { z } from 'zod'
import { streamText, tool, stepCountIs, convertToModelMessages } from 'ai'
import type { UIMessage } from 'ai'
import { eq } from 'drizzle-orm'
import { templates } from '~~/server/database/schema'
import type { TemplateField, TemplateDependency } from '~~/server/database/schema'

const SYSTEM_PROMPT = `You are a helpful assistant that builds interactive practice activity templates for learning experience designers. Your goal is to help the user create a Vue 3 activity component through guided conversation.

You have three tools available:

1. **ask_question** — Use this to ask the user a structured multiple-choice question. Each option should be a clear, distinct choice. Use this tool frequently to guide the design process rather than asking open-ended questions. Keep questions focused and options concise. Note: the UI automatically appends a "Type my own answer" option to every question, so the user may respond with free-text instead of one of your provided options. Handle this gracefully.

2. **get_template** — Use this to retrieve the current state of the template, including its name, description, input schema (field definitions), sample data, and Vue component source code. Call this when the user asks about the current template, wants to modify it, or when you need to see what already exists before making changes. Always call this before issuing an update_template if there's an existing template you haven't seen yet.

3. **update_template** — Use this to provide or update the template definition. Call this whenever you have enough information to generate or improve the template. The template has three parts:
   - **fields**: An array of field definitions that describe what data the template needs. Available field types:
     - \`text\` — Single-line text input. Supports \`placeholder\` and \`default\`.
     - \`textarea\` — Multi-line text input. Supports \`placeholder\` and \`default\`.
     - \`dropdown\` — Select from predefined options. Requires \`options\` array of strings. Supports \`default\`.
     - \`checkbox\` — Boolean toggle. Supports \`default\`.
     - \`number\` — Numeric input. Supports \`min\`, \`max\`, and \`default\`.
     - \`color\` — Color picker with hex value. Supports \`default\`.
     - \`array\` — A repeatable list of items. Requires \`fields\` (sub-field definitions for each item). Use this for lists of structured data like quiz questions, flashcards, steps, options, etc. Array fields can be nested (arrays within arrays).
     The \`default\` property on fields defines the initial value when a user creates a new activity from this template. It is NOT for example/preview data — that goes in \`sampleData\`.
   - **component**: A Vue 3 Single File Component (SFC) using \`<script setup>\` and the Composition API. The component receives a \`data\` prop containing the filled-in values from the input schema. Use clean, modern Vue 3 patterns. Style with Tailwind CSS utility classes. The component should be self-contained and work standalone.
   - **sampleData**: A complete data object with realistic example content, used to preview the template. Keys must match the field IDs from the \`fields\` array. For array fields, include 2-3 representative items with meaningful content so the preview looks realistic. This is separate from field \`default\` values — sampleData is for previewing, defaults are for new activity creation.
   - **dependencies** (optional): An array of external libraries to load via CDN in the preview iframe. Each entry has:
     - \`name\` — The package name (e.g., \`"chart.js"\`, \`"canvas-confetti"\`)
     - \`url\` — A CDN URL for the library (prefer jsdelivr: \`https://cdn.jsdelivr.net/npm/<package>@<version>\`)
     - \`global\` — The global variable name the script exposes (e.g., \`"Chart"\`, \`"confetti"\`)
     The component can then use \`window.<global>\` to access the library. Only include dependencies when the component genuinely needs a third-party library (charts, animations, drag-and-drop, etc.). Common libraries and their globals:
     - Chart.js: \`{ name: "chart.js", url: "https://cdn.jsdelivr.net/npm/chart.js@4", global: "Chart" }\`
     - canvas-confetti: \`{ name: "canvas-confetti", url: "https://cdn.jsdelivr.net/npm/canvas-confetti@1", global: "confetti" }\`
     - SortableJS: \`{ name: "sortablejs", url: "https://cdn.jsdelivr.net/npm/sortablejs@1", global: "Sortable" }\`
     - anime.js: \`{ name: "animejs", url: "https://cdn.jsdelivr.net/npm/animejs@3", global: "anime" }\`
     - Marked (Markdown): \`{ name: "marked", url: "https://cdn.jsdelivr.net/npm/marked@12", global: "marked" }\`

When designing templates that need lists of structured data (e.g., quiz questions with options, flashcard decks, scenario steps), use the \`array\` field type. For example, a quiz might have:
- An \`array\` field "questions" with sub-fields: "questionText" (text), "options" (array of sub-fields: "text" (text), "isCorrect" (checkbox))

Workflow:
- Start by understanding what kind of activity the user wants to build
- Use ask_question to narrow down the activity type, structure, and features
- Generate an initial template early so the user can see progress in the preview
- Always include realistic sampleData so the preview looks compelling immediately
- Iterate based on feedback — update the template as the conversation progresses
- Keep your text responses concise and focused

## Error Feedback

When you call \`update_template\`, the component is immediately compiled and rendered in the preview. If the preview encounters a compile or runtime error, it will be automatically reported back to you as a message starting with \`[Preview Error]\`. When you receive one:
1. Read the error message carefully to identify the root cause
2. Call \`get_template\` to see the current component source if needed
3. Fix the issue and call \`update_template\` with the corrected component
4. Do NOT apologize excessively — just briefly explain what went wrong and provide the fix

## Preview Environment Constraints

The Vue component is compiled and rendered inside a **sandboxed iframe** using vue3-sfc-loader. You MUST follow these rules:

**Available in the iframe:**
- Vue 3 (global \`Vue\`) — all Composition API features work
- Tailwind CSS (loaded via CDN) — use utility classes for all styling
- Any libraries added via the \`dependencies\` array (loaded as \`<script>\` tags in the initial HTML, exposing a global on \`window\`)
- \`eval()\`, \`new Function()\` — dynamic code evaluation works (useful for coding challenges, expression evaluation, etc.)
- Activity tools (see below)

**TypeScript limitations:** The SFC is compiled at runtime by vue3-sfc-loader, which has LIMITED TypeScript support. Rules:
- Do NOT use \`declare global\`, \`declare module\`, or ambient type declarations.
- Do NOT use TypeScript syntax (\`as\`, type annotations, generics) inside template expressions (\`@click\`, \`v-if\`, \`{{ }}\`, \`:class\`, etc.). Template expressions are compiled as plain JavaScript. For example, write \`@click="activeTab = tab"\` NOT \`@click="activeTab = tab as any"\`.
- TypeScript IS supported in the \`<script setup>\` block — use \`as\`, generics, interfaces, and type annotations freely there.
- Use \`(window as any)\` in the script block for accessing globals.

**Dependency rules:** Only include libraries in \`dependencies\` that work as a self-contained \`<script>\` tag exposing a global. The library must NOT need to fetch additional files at runtime (web workers, language files, CSS, etc.). Good examples: Chart.js, canvas-confetti, SortableJS, Marked, anime.js.

**NOT available via dependencies:**
- Node.js APIs (\`require\`, \`fs\`, \`path\`, etc.)

## Activity Tools (IMPORTANT)

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

    const result = streamText({
      model,
      system: SYSTEM_PROMPT,
      messages: convertedMessages,
      stopWhen: stepCountIs(5),
      tools: {
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
          description: 'Create or update the activity template with an input schema, Vue 3 component, sample data, optional CDN dependencies, and optional activity tools.',
          inputSchema: z.object({
            fields: z.array(fieldSchema).describe('Array of input field definitions'),
            component: z.string().describe('Complete Vue 3 SFC source code using <script setup lang="ts"> and Tailwind CSS'),
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
