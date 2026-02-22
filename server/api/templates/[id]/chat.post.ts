import { z } from 'zod'
import { streamText, tool, stepCountIs } from 'ai'
import type { UIMessage } from 'ai'
import { eq, and } from 'drizzle-orm'
import { templates, templateVersions, templatePendingChanges, templateMigrations, activities, courseSections, courses, projects } from '~~/server/database/schema'
import type { TemplateField, TemplateDependency } from '~~/server/database/schema'
import { askQuestionTool } from '~~/server/utils/tools/askQuestion'
import { getReferenceTool } from '~~/server/utils/tools/getReference'
import { fieldSchema } from '~~/server/utils/tools/fieldSchema'
import { hasSchemaChanged } from '~~/server/utils/schemaEquality'
import { runMigration, validateMigrationSyntax } from '~~/server/utils/runMigration'
import { validateDataAgainstSchema } from '~~/server/utils/buildZodFromInputSchema'
import { compactContext } from '~~/server/utils/contextCompaction'
import { recordTokenUsage, incrementEntityTokens } from '~~/server/utils/tokens'
import { validateTemplate } from '~~/server/utils/templateValidation'
import { PLAN_MODE_INSTRUCTION, type ChatMode } from '~~/server/utils/chatMode'

export default defineLazyEventHandler(() => {
  return defineEventHandler(async (event) => {
    const id = getRouterParam(event, 'id')
    if (!id) {
      throw createError({ statusCode: 400, statusMessage: 'Template ID is required' })
    }

    const body = await readBody(event)
    const messages: UIMessage[] = body?.messages
    const mode: ChatMode = body?.mode ?? 'build'

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
          p.output = p.output ?? { answered: true, answers: {} }
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
    const baseSystemPrompt = tmpl.kind === 'interface'
      ? prompts.interface
      : prompts.activity

    // Append plan mode instruction when in plan mode
    const systemPrompt = mode === 'plan'
      ? `${baseSystemPrompt}\n\n${PLAN_MODE_INSTRUCTION}`
      : baseSystemPrompt

    let model
    let provider: { id: string } | null = null
    try {
      const active = useActiveModel()
      model = active.model
      provider = active.provider
    }
    catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'No active LLM provider configured'
      throw createError({ statusCode: 409, statusMessage: message })
    }

    // Apply context compaction if needed
    const compaction = await compactContext(messages, systemPrompt, model)

    // For interfaces, the update_template tool description is adjusted
    const updateTemplateDescription = tmpl.kind === 'interface'
      ? 'Create or update the interface template with an input schema, Vue 3 component (must include <slot name="activity">), sample data, and optional CDN dependencies.'
      : 'Create or update the activity template with an input schema, Vue 3 component, sample data, optional CDN dependencies, and optional activity tools.'

    // ─── Read-only tools (available in both Plan and Build modes) ────────────
    const readOnlyTools = {
      get_reference: getReferenceTool,
      get_template: tool({
        description: 'Retrieve the current template state including name, description, input schema (field definitions), and Vue component source. Use this to inspect what has been built so far before making changes. ALWAYS call this before making updates.',
        inputSchema: z.object({}),
        execute: async () => {
          const current = db.select().from(templates).where(eq(templates.id, id)).get()
          if (!current) return { error: 'Template not found' }

          // Update last read timestamp for stale context detection
          db.update(templates)
            .set({ componentLastReadAt: new Date() })
            .where(eq(templates.id, id))
            .run()

          // Check for pending schema changes (from a previous update_template that detected breaking changes)
          const pending = db
            .select()
            .from(templatePendingChanges)
            .where(eq(templatePendingChanges.templateId, id))
            .get()

          return {
            name: current.name,
            description: current.description,
            inputSchema: current.inputSchema,
            component: current.component,
            sampleData: current.sampleData,
            dependencies: current.dependencies,
            tools: current.tools,
            status: current.status,
            schemaVersion: current.schemaVersion,
            hasPendingChanges: !!pending,
          }
        },
      }),
      ask_question: askQuestionTool,
    }

    // ─── Write tools (only available in Build mode) ──────────────────────────
    const writeTools = {
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
            // Check for stale context (only if there was a previous modification)
            const current = db.select().from(templates).where(eq(templates.id, id)).get()
            if (!current) return { success: false, error: 'Template not found' }

            if (current.componentLastModifiedAt) {
              const lastMod = current.componentLastModifiedAt.getTime()
              const lastRead = current.componentLastReadAt?.getTime() ?? 0

              if (lastMod > lastRead) {
                return {
                  success: false,
                  error: `Template component has been modified since it was last read.\n`
                    + `Last modification: ${current.componentLastModifiedAt.toISOString()}\n`
                    + `Last read: ${current.componentLastReadAt?.toISOString() ?? 'never'}\n\n`
                    + `Please call get_template to read the current state before making changes.`,
                }
              }
            }

            // Check if schema has changed structurally
            const schemaChanged = hasSchemaChanged(
              current.inputSchema as TemplateField[] | null,
              fields as TemplateField[],
            )

            if (schemaChanged) {
              // Find activities using this template
              const affectedActivities = db
                .select({
                  id: activities.id,
                  name: activities.name,
                  projectId: projects.id,
                  projectName: projects.name,
                  courseId: courses.id,
                  courseName: courses.name,
                })
                .from(activities)
                .innerJoin(courseSections, eq(activities.sectionId, courseSections.id))
                .innerJoin(courses, eq(courseSections.courseId, courses.id))
                .innerJoin(projects, eq(courses.projectId, projects.id))
                .where(eq(activities.templateId, id))
                .all()

              if (affectedActivities.length > 0) {
                // Store pending changes
                db.delete(templatePendingChanges)
                  .where(eq(templatePendingChanges.templateId, id))
                  .run()

                db.insert(templatePendingChanges).values({
                  id: crypto.randomUUID(),
                  templateId: id,
                  inputSchema: fields as TemplateField[],
                  component,
                  sampleData,
                  dependencies: (dependencies as TemplateDependency[]) || [],
                  tools: toolIds || [],
                  createdAt: new Date(),
                }).run()

                // Return info about affected activities for the LLM to relay to the user
                const activityList = affectedActivities.map(a => ({
                  name: a.name,
                  project: a.projectName,
                  course: a.courseName,
                  url: `/projects/${a.projectId}/courses/${a.courseId}/activities/${a.id}`,
                }))

                return {
                  success: false,
                  schemaChangeDetected: true,
                  affectedActivitiesCount: affectedActivities.length,
                  affectedActivities: activityList,
                  message: `The data structure (input schema) will change. There are ${affectedActivities.length} existing activities using this template. Use the ask_question tool to ask the user whether to: (1) Migrate existing activities to the new schema (you'll need to provide a migration function), or (2) Keep existing activities on the old schema and use the new version going forward.`,
                }
              }

              // No affected activities - can proceed with version bump
              const newVersion = current.schemaVersion + 1

              // Create new version snapshot
              db.insert(templateVersions).values({
                id: crypto.randomUUID(),
                templateId: id,
                version: newVersion,
                inputSchema: fields as TemplateField[],
                component,
                sampleData,
                dependencies: (dependencies as TemplateDependency[]) || [],
                tools: toolIds || [],
                createdAt: new Date(),
              }).run()

              // Update template
              db.update(templates)
                .set({
                  schemaVersion: newVersion,
                  inputSchema: fields as TemplateField[],
                  component,
                  sampleData,
                  dependencies: (dependencies as TemplateDependency[]) || [],
                  tools: toolIds || [],
                  componentLastModifiedAt: new Date(),
                  componentLastReadAt: null,
                  updatedAt: new Date(),
                })
                .where(eq(templates.id, id))
                .run()

              // Check for warnings (non-blocking)
              const warnings = validateTemplate(fields as TemplateField[], sampleData as Record<string, unknown>, component)
              if (warnings.length > 0) {
                return { success: true, fieldCount: fields.length, schemaVersion: newVersion, versionBumped: true, warnings: warnings.map(w => w.message) }
              }
              return { success: true, fieldCount: fields.length, schemaVersion: newVersion, versionBumped: true }
            }

            // No schema change - update template and current version snapshot
            db.update(templates)
              .set({
                inputSchema: fields as TemplateField[],
                component,
                sampleData,
                dependencies: (dependencies as TemplateDependency[]) || [],
                tools: toolIds || [],
                componentLastModifiedAt: new Date(),
                componentLastReadAt: null,
                updatedAt: new Date(),
              })
              .where(eq(templates.id, id))
              .run()

            // Update current version snapshot
            db.update(templateVersions)
              .set({
                inputSchema: fields as TemplateField[],
                component,
                sampleData,
                dependencies: (dependencies as TemplateDependency[]) || [],
                tools: toolIds || [],
              })
              .where(
                and(
                  eq(templateVersions.templateId, id),
                  eq(templateVersions.version, current.schemaVersion),
                ),
              )
              .run()

            // Check for warnings (non-blocking)
            const warnings = validateTemplate(fields as TemplateField[], sampleData as Record<string, unknown>, component)
            if (warnings.length > 0) {
              return { success: true, fieldCount: fields.length, warnings: warnings.map(w => w.message) }
            }
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

            // Check for stale context (only if there was a previous modification)
            if (current.componentLastModifiedAt) {
              const lastMod = current.componentLastModifiedAt.getTime()
              const lastRead = current.componentLastReadAt?.getTime() ?? 0

              if (lastMod > lastRead) {
                return {
                  success: false,
                  error: `Template component has been modified since it was last read.\n`
                    + `Last modification: ${current.componentLastModifiedAt.toISOString()}\n`
                    + `Last read: ${current.componentLastReadAt?.toISOString() ?? 'never'}\n\n`
                    + `Please call get_template to read the current state before making changes.`,
                }
              }
            }

            // Check if schema has changed structurally (when fields are provided)
            if (fields) {
              const schemaChanged = hasSchemaChanged(
                current.inputSchema as TemplateField[] | null,
                fields as TemplateField[],
              )

              if (schemaChanged) {
                // Find activities using this template
                const affectedActivities = db
                  .select({
                    id: activities.id,
                    name: activities.name,
                    projectId: projects.id,
                    projectName: projects.name,
                    courseId: courses.id,
                    courseName: courses.name,
                  })
                  .from(activities)
                  .innerJoin(courseSections, eq(activities.sectionId, courseSections.id))
                  .innerJoin(courses, eq(courseSections.courseId, courses.id))
                  .innerJoin(projects, eq(courses.projectId, projects.id))
                  .where(eq(activities.templateId, id))
                  .all()

                if (affectedActivities.length > 0) {
                  // Apply component operations first to get patched component
                  let patched = current.component
                  for (let i = 0; i < operations.length; i++) {
                    const op = operations[i]!
                    const { search, replace } = op
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

                  // Store pending changes
                  db.delete(templatePendingChanges)
                    .where(eq(templatePendingChanges.templateId, id))
                    .run()

                  db.insert(templatePendingChanges).values({
                    id: crypto.randomUUID(),
                    templateId: id,
                    inputSchema: fields as TemplateField[],
                    component: patched,
                    sampleData: sampleData ?? current.sampleData,
                    dependencies: (dependencies as TemplateDependency[]) ?? current.dependencies ?? [],
                    tools: toolIds ?? current.tools ?? [],
                    createdAt: new Date(),
                  }).run()

                  // Return info about affected activities for the LLM to relay to the user
                  const activityList = affectedActivities.map(a => ({
                    name: a.name,
                    project: a.projectName,
                    course: a.courseName,
                    url: `/projects/${a.projectId}/courses/${a.courseId}/activities/${a.id}`,
                  }))

                  return {
                    success: false,
                    schemaChangeDetected: true,
                    affectedActivitiesCount: affectedActivities.length,
                    affectedActivities: activityList,
                    message: `The data structure (input schema) will change. There are ${affectedActivities.length} existing activities using this template. Use the ask_question tool to ask the user whether to: (1) Migrate existing activities to the new schema (you'll need to provide a migration function), or (2) Keep existing activities on the old schema and use the new version going forward.`,
                  }
                }
              }
            }

            let patched = current.component

            // Apply operations sequentially
            for (let i = 0; i < operations.length; i++) {
              const op = operations[i]!
              const { search, replace } = op

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

            // Check if this is a schema version bump (fields changed but no affected activities)
            const schemaChanged = fields && hasSchemaChanged(
              current.inputSchema as TemplateField[] | null,
              fields as TemplateField[],
            )

            if (schemaChanged) {
              // No affected activities - can proceed with version bump
              const newVersion = current.schemaVersion + 1

              // Create new version snapshot
              db.insert(templateVersions).values({
                id: crypto.randomUUID(),
                templateId: id,
                version: newVersion,
                inputSchema: fields as TemplateField[],
                component: patched,
                sampleData: sampleData ?? current.sampleData,
                dependencies: (dependencies as TemplateDependency[]) ?? current.dependencies ?? [],
                tools: toolIds ?? current.tools ?? [],
                createdAt: new Date(),
              }).run()

              // Update template
              db.update(templates)
                .set({
                  schemaVersion: newVersion,
                  inputSchema: fields as TemplateField[],
                  component: patched,
                  sampleData: sampleData ?? current.sampleData,
                  dependencies: (dependencies as TemplateDependency[]) ?? current.dependencies ?? [],
                  tools: toolIds ?? current.tools ?? [],
                  componentLastModifiedAt: new Date(),
                  componentLastReadAt: null,
                  updatedAt: new Date(),
                })
                .where(eq(templates.id, id))
                .run()

              // Check for warnings (non-blocking)
              const finalFields = fields as TemplateField[]
              const finalSampleData = (sampleData ?? current.sampleData) as Record<string, unknown>
              const warnings = validateTemplate(finalFields, finalSampleData, patched)
              if (warnings.length > 0) {
                return { success: true, operationsApplied: operations.length, schemaVersion: newVersion, versionBumped: true, warnings: warnings.map(w => w.message) }
              }
              return { success: true, operationsApplied: operations.length, schemaVersion: newVersion, versionBumped: true }
            }

            // Build the update payload — only include fields that were provided
            const updatePayload: Record<string, unknown> = {
              component: patched,
              componentLastModifiedAt: new Date(),
              componentLastReadAt: null, // Force re-read before next modification
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

            // Update current version snapshot if we changed fields/sampleData/deps/tools
            if (fields || sampleData || dependencies !== undefined || toolIds !== undefined) {
              const versionUpdatePayload: Record<string, unknown> = { component: patched }
              if (fields) versionUpdatePayload.inputSchema = fields as TemplateField[]
              if (sampleData) versionUpdatePayload.sampleData = sampleData
              if (dependencies !== undefined) versionUpdatePayload.dependencies = (dependencies as TemplateDependency[]) || []
              if (toolIds !== undefined) versionUpdatePayload.tools = toolIds || []

              db.update(templateVersions)
                .set(versionUpdatePayload)
                .where(
                  and(
                    eq(templateVersions.templateId, id),
                    eq(templateVersions.version, current.schemaVersion),
                  ),
                )
                .run()
            }

            // Check for warnings (non-blocking)
            const finalFields = (fields ?? current.inputSchema) as TemplateField[]
            const finalSampleData = (sampleData ?? current.sampleData) as Record<string, unknown>
            const warnings = validateTemplate(finalFields, finalSampleData, patched)
            if (warnings.length > 0) {
              return { success: true, operationsApplied: operations.length, warnings: warnings.map(w => w.message) }
            }
            return { success: true, operationsApplied: operations.length }
          },
        }),
        update_sample_data: tool({
          description: 'Update only the sample data without changing the schema, component, or dependencies. Use this for quick iterations on example content, fixing validation warnings about HTML in sample data, or testing how different content renders.',
          inputSchema: z.object({
            sampleData: z.record(z.string(), z.unknown()).describe('Updated sample data matching the existing field IDs. For array fields, include 2-3 representative items with meaningful content. Use Markdown for formatted text (not HTML tags).'),
          }),
          execute: async ({ sampleData }) => {
            const current = db.select().from(templates).where(eq(templates.id, id)).get()
            if (!current) return { success: false, error: 'Template not found' }

            const currentFields = current.inputSchema as TemplateField[] | null
            if (!currentFields || currentFields.length === 0) {
              return { success: false, error: 'Template has no schema defined. Use update_template to create the initial template first.' }
            }

            // Validate sample data against the existing schema
            const validation = validateDataAgainstSchema(sampleData, currentFields)
            if (!validation.success) {
              return {
                success: false,
                error: `Sample data does not match the schema: ${validation.errors.join(', ')}`,
              }
            }

            // Update template
            db.update(templates)
              .set({
                sampleData,
                updatedAt: new Date(),
              })
              .where(eq(templates.id, id))
              .run()

            // Update current version snapshot
            db.update(templateVersions)
              .set({ sampleData })
              .where(
                and(
                  eq(templateVersions.templateId, id),
                  eq(templateVersions.version, current.schemaVersion),
                ),
              )
              .run()

            // Check for warnings (non-blocking)
            const warnings = validateTemplate(currentFields, sampleData as Record<string, unknown>, current.component ?? '')
            if (warnings.length > 0) {
              return { success: true, warnings: warnings.map(w => w.message) }
            }
            return { success: true }
          },
        }),
        commit_schema_change: tool({
          description: 'Commit a pending schema change after the user has chosen how to handle existing activities. Call this after update_template or patch_component detected a schema change and the user responded to the migration choice.',
          inputSchema: z.object({
            action: z.enum(['migrate', 'skip']).describe('Whether to migrate existing activities to the new schema, or skip them (keep them on the old version)'),
            migrationFn: z.string().optional().describe('JavaScript function body that transforms old data to new schema. Receives `data` (old activity data object), must return transformed data object. Required when action is "migrate". Example: "return { ...data, newField: data.oldField || \'default\' }"'),
          }),
          execute: async ({ action, migrationFn }) => {
            // Get pending changes
            const pending = db
              .select()
              .from(templatePendingChanges)
              .where(eq(templatePendingChanges.templateId, id))
              .get()

            if (!pending) {
              return { success: false, error: 'No pending schema change found. Call update_template or patch_component first to propose changes.' }
            }

            const current = db.select().from(templates).where(eq(templates.id, id)).get()
            if (!current) {
              return { success: false, error: 'Template not found' }
            }

            const newVersion = current.schemaVersion + 1

            if (action === 'migrate') {
              if (!migrationFn) {
                return { success: false, error: 'migrationFn is required when action is "migrate"' }
              }

              // Validate migration function syntax
              const syntaxError = validateMigrationSyntax(migrationFn)
              if (syntaxError) {
                return { success: false, error: `Migration function syntax error: ${syntaxError}` }
              }

              // Find all activities using this template
              const affectedActivities = db
                .select({
                  id: activities.id,
                  name: activities.name,
                  data: activities.data,
                  projectId: projects.id,
                  courseId: courses.id,
                })
                .from(activities)
                .innerJoin(courseSections, eq(activities.sectionId, courseSections.id))
                .innerJoin(courses, eq(courseSections.courseId, courses.id))
                .innerJoin(projects, eq(courses.projectId, projects.id))
                .where(eq(activities.templateId, id))
                .all()

              // Test migration on all activities first
              const migrationResults: Array<{ activityId: string, activityName: string, success: boolean, error?: string }> = []

              for (const activity of affectedActivities) {
                const oldData = activity.data as Record<string, unknown> ?? {}
                const migrationResult = await runMigration(migrationFn, oldData)

                if (!migrationResult.success) {
                  migrationResults.push({
                    activityId: activity.id,
                    activityName: activity.name,
                    success: false,
                    error: migrationResult.error,
                  })
                  continue
                }

                // Validate against new schema
                const validation = validateDataAgainstSchema(
                  migrationResult.data,
                  pending.inputSchema as TemplateField[],
                )

                if (!validation.success) {
                  migrationResults.push({
                    activityId: activity.id,
                    activityName: activity.name,
                    success: false,
                    error: `Validation failed: ${validation.errors.join(', ')}`,
                  })
                }
                else {
                  migrationResults.push({
                    activityId: activity.id,
                    activityName: activity.name,
                    success: true,
                  })
                }
              }

              // Check if all migrations succeeded
              const failures = migrationResults.filter(r => !r.success)
              if (failures.length > 0) {
                return {
                  success: false,
                  error: 'Migration validation failed for some activities. Fix the migration function and try again.',
                  failures: failures.map(f => ({
                    activity: f.activityName,
                    error: f.error,
                  })),
                }
              }

              // All passed - commit the changes
              // 1. Create new version snapshot
              db.insert(templateVersions).values({
                id: crypto.randomUUID(),
                templateId: id,
                version: newVersion,
                inputSchema: pending.inputSchema,
                component: pending.component,
                sampleData: pending.sampleData,
                dependencies: pending.dependencies,
                tools: pending.tools,
                createdAt: new Date(),
              }).run()

              // 2. Store migration function
              db.insert(templateMigrations).values({
                id: crypto.randomUUID(),
                templateId: id,
                fromVersion: current.schemaVersion,
                toVersion: newVersion,
                migrationFn,
                createdAt: new Date(),
              }).run()

              // 3. Update template to new version
              db.update(templates)
                .set({
                  schemaVersion: newVersion,
                  inputSchema: pending.inputSchema,
                  component: pending.component,
                  sampleData: pending.sampleData,
                  dependencies: pending.dependencies,
                  tools: pending.tools,
                  componentLastModifiedAt: new Date(),
                  componentLastReadAt: null,
                  updatedAt: new Date(),
                })
                .where(eq(templates.id, id))
                .run()

              // 4. Migrate all activities
              for (const activity of affectedActivities) {
                const oldData = activity.data as Record<string, unknown> ?? {}
                const result = await runMigration(migrationFn, oldData)

                // We already validated all migrations above, so this should always succeed
                if (!result.success) {
                  // This shouldn't happen since we validated, but handle it gracefully
                  return {
                    success: false,
                    error: `Unexpected migration error for activity "${activity.name}": ${result.error}`,
                  }
                }

                db.update(activities)
                  .set({
                    data: result.data,
                    dataSchemaVersion: newVersion,
                    updatedAt: new Date(),
                  })
                  .where(eq(activities.id, activity.id))
                  .run()
              }

              // 5. Clear pending changes
              db.delete(templatePendingChanges)
                .where(eq(templatePendingChanges.templateId, id))
                .run()

              return {
                success: true,
                schemaVersion: newVersion,
                migratedActivities: affectedActivities.length,
              }
            }
            else {
              // action === 'skip'
              // Create new version but don't migrate activities - they stay on old version

              // 1. Create new version snapshot
              db.insert(templateVersions).values({
                id: crypto.randomUUID(),
                templateId: id,
                version: newVersion,
                inputSchema: pending.inputSchema,
                component: pending.component,
                sampleData: pending.sampleData,
                dependencies: pending.dependencies,
                tools: pending.tools,
                createdAt: new Date(),
              }).run()

              // 2. Update template to new version
              db.update(templates)
                .set({
                  schemaVersion: newVersion,
                  inputSchema: pending.inputSchema,
                  component: pending.component,
                  sampleData: pending.sampleData,
                  dependencies: pending.dependencies,
                  tools: pending.tools,
                  componentLastModifiedAt: new Date(),
                  componentLastReadAt: null,
                  updatedAt: new Date(),
                })
                .where(eq(templates.id, id))
                .run()

              // 3. Clear pending changes
              db.delete(templatePendingChanges)
                .where(eq(templatePendingChanges.templateId, id))
                .run()

              // Count activities that will remain on old version
              const oldVersionActivities = db
                .select({ count: activities.id })
                .from(activities)
                .where(eq(activities.templateId, id))
                .all()

              return {
                success: true,
                schemaVersion: newVersion,
                skippedActivities: oldVersionActivities.length,
                message: `Template updated to version ${newVersion}. ${oldVersionActivities.length} existing activities remain on version ${current.schemaVersion} and can be upgraded individually later.`,
              }
            }
          },
        }),
      }

    // Select tools based on mode
    const tools = mode === 'plan'
      ? readOnlyTools
      : { ...readOnlyTools, ...writeTools }

    const result = streamText({
      model,
      system: systemPrompt,
      messages: compaction.messages,
      stopWhen: stepCountIs(5),
      tools,
      maxOutputTokens: 16384,
      onFinish: async ({ totalUsage }) => {
        // Record token usage to database
        // AI SDK v6 uses inputTokens/outputTokens, we store as promptTokens/completionTokens
        if (totalUsage) {
          const promptTokens = totalUsage.inputTokens ?? 0
          const completionTokens = totalUsage.outputTokens ?? 0
          await recordTokenUsage({
            entityType: 'template',
            entityId: id,
            providerId: provider?.id ?? null,
            modelId: model.modelId ?? 'unknown',
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
            wasCompacted: compaction.wasCompacted,
          })
          // Increment cumulative token counters on the template
          incrementEntityTokens('template', id, promptTokens, completionTokens)
        }
      },
    })

    return result.toUIMessageStreamResponse({
      messageMetadata: ({ part }) => {
        if (part.type === 'start') {
          return {
            tokenUsage: {
              contextTokens: compaction.compactedTokens,
              wasCompacted: compaction.wasCompacted,
              compactionMessage: compaction.compactionMessage,
            },
          }
        }
        if (part.type === 'finish') {
          // AI SDK v6 uses inputTokens/outputTokens
          const promptTokens = part.totalUsage?.inputTokens ?? 0
          const completionTokens = part.totalUsage?.outputTokens ?? 0
          return {
            tokenUsage: {
              promptTokens,
              completionTokens,
              totalTokens: promptTokens + completionTokens,
            },
          }
        }
        return undefined
      },
    })
  })
})
