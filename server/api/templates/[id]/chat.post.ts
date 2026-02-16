import { z } from 'zod'
import { streamText, tool, stepCountIs, convertToModelMessages } from 'ai'
import type { UIMessage } from 'ai'
import { eq } from 'drizzle-orm'
import { templates } from '~~/server/database/schema'
import type { TemplateField, TemplateDependency } from '~~/server/database/schema'

// ── Reference file storage key map for the get_reference tool ────────────────
// Maps topic names to their storage keys under assets:ui-references
const REFERENCE_KEY_MAP: Record<string, string> = {
  'overview': 'SKILL.md',
  'components': 'references:components.md',
  'theming': 'references:theming.md',
  'composables': 'references:composables.md',
  'layout-dashboard': 'references:layouts:dashboard.md',
  'layout-page': 'references:layouts:page.md',
  'layout-chat': 'references:layouts:chat.md',
  'layout-docs': 'references:layouts:docs.md',
  'layout-editor': 'references:layouts:editor.md',
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

    // Load system prompts (cached after first call)
    const prompts = await useSystemPrompts()
    const systemPrompt = tmpl.kind === 'interface'
      ? prompts.interface
      : prompts.activity

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
              const key = REFERENCE_KEY_MAP[topic]
              if (!key) return { topic, error: `Unknown reference topic: ${topic}` }
              const content = await useStorage('assets:ui-references').getItem<string>(key)
              if (!content) return { topic, error: `Reference file not found: ${key}` }
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
        patch_component: tool({
          description: 'Apply targeted search-and-replace edits to the existing component source code. Use this instead of update_template for incremental changes (styling tweaks, adding features, fixing bugs). Much faster than regenerating the entire component.',
          inputSchema: z.object({
            operations: z.array(z.object({
              search: z.string().describe('Exact string to find in the current component source. Must match exactly (including whitespace/indentation). Include enough surrounding context to uniquely identify the location.'),
              replace: z.string().describe('The replacement string. Can be empty string to delete the matched text.'),
            })).min(1).describe('Search-and-replace operations to apply sequentially to the component source.'),
            fields: z.array(fieldSchema).optional().describe('Updated field definitions. Only include if fields need to change alongside the component edit.'),
            sampleData: z.record(z.string(), z.unknown()).optional().describe('Updated sample data. Only include if sample data needs to change alongside the component edit.'),
            dependencies: z.array(z.object({
              name: z.string().describe('Package name'),
              url: z.string().url().describe('CDN URL'),
              global: z.string().describe('Global variable name'),
            })).optional().describe('Updated dependencies. Only include if dependencies need to change.'),
            tools: z.array(z.enum(['code-editor'])).optional().describe('Updated activity tools. Only include if tools need to change.'),
          }),
          execute: async ({ operations, fields, sampleData, dependencies, tools: toolIds }) => {
            // Get the current component source
            const current = db.select().from(templates).where(eq(templates.id, id)).get()
            if (!current?.component) {
              return { success: false, error: 'No existing component to patch. Use update_template to create the initial template.' }
            }

            let patched = current.component

            // Apply operations sequentially
            for (let i = 0; i < operations.length; i++) {
              const { search, replace } = operations[i]

              // Count occurrences
              const firstIdx = patched.indexOf(search)
              if (firstIdx === -1) {
                return {
                  success: false,
                  error: `Operation ${i + 1} failed: search string not found in component source. Call get_template to see the current source and try again with the exact text.`,
                  currentComponent: patched,
                }
              }

              const secondIdx = patched.indexOf(search, firstIdx + 1)
              if (secondIdx !== -1) {
                return {
                  success: false,
                  error: `Operation ${i + 1} failed: search string matches multiple locations. Include more surrounding context to uniquely identify the location.`,
                  currentComponent: patched,
                }
              }

              patched = patched.substring(0, firstIdx) + replace + patched.substring(firstIdx + search.length)
            }

            // Build the update payload — only include fields that were provided
            const updatePayload: Record<string, unknown> = {
              component: patched,
              updatedAt: new Date(),
            }
            if (fields) updatePayload.inputSchema = fields as TemplateField[]
            if (sampleData) updatePayload.sampleData = sampleData
            if (dependencies !== undefined) updatePayload.dependencies = (dependencies as TemplateDependency[]) || []
            if (toolIds !== undefined) updatePayload.tools = toolIds || []

            db.update(templates)
              .set(updatePayload)
              .where(eq(templates.id, id))
              .run()

            return { success: true, operationsApplied: operations.length }
          },
        }),
      },
      maxOutputTokens: 16384,
    })

    return result.toUIMessageStreamResponse()
  })
})
