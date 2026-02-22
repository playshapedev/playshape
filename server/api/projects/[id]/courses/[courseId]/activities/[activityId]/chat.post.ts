import { z } from 'zod'
import { streamText, tool, stepCountIs } from 'ai'
import type { UIMessage } from 'ai'
import { eq, and, isNotNull, inArray } from 'drizzle-orm'
import { activities, templates, templateVersions, courseSections, courses, projectLibraries, documentChunks, documents } from '~~/server/database/schema'
import type { TemplateField } from '~~/server/database/schema'
import { askQuestionTool } from '~~/server/utils/tools/askQuestion'
import { compactContext } from '~~/server/utils/contextCompaction'
import { recordTokenUsage } from '~~/server/utils/tokens'
import { checkHtmlInSampleData } from '~~/server/utils/templateValidation'

export default defineLazyEventHandler(() => {
  return defineEventHandler(async (event) => {
    const projectId = getRouterParam(event, 'id')
    const courseId = getRouterParam(event, 'courseId')
    const activityId = getRouterParam(event, 'activityId')
    if (!projectId || !courseId || !activityId) {
      throw createError({ statusCode: 400, statusMessage: 'Project ID, Course ID, and Activity ID are required' })
    }

    const body = await readBody(event)
    const messages: UIMessage[] = body?.messages

    if (!messages || !Array.isArray(messages)) {
      throw createError({
        statusCode: 400,
        statusMessage: `Invalid request: expected "messages" array, got ${typeof messages}`,
      })
    }

    // Patch ask_question tool calls that have no result (client-side only tool)
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

    const db = useDb()

    // Verify course belongs to project
    const course = db.select().from(courses).where(eq(courses.id, courseId)).get()
    if (!course || course.projectId !== projectId) {
      throw createError({ statusCode: 404, statusMessage: 'Course not found' })
    }

    // Fetch activity and verify it belongs to this course
    const activity = db.select().from(activities).where(eq(activities.id, activityId)).get()
    if (!activity) {
      throw createError({ statusCode: 404, statusMessage: 'Activity not found' })
    }

    const section = db.select().from(courseSections).where(eq(courseSections.id, activity.sectionId)).get()
    if (!section || section.courseId !== courseId) {
      throw createError({ statusCode: 404, statusMessage: 'Activity not found in this course' })
    }

    // Fetch the template
    const tmpl = db.select().from(templates).where(eq(templates.id, activity.templateId)).get()
    if (!tmpl) {
      throw createError({ statusCode: 404, statusMessage: 'Activity template not found' })
    }

    // Load system prompt
    const systemPrompt = await useActivityEditorPrompt()

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

    // Get project's linked library IDs for search_libraries tool
    const linkedLibraries = db
      .select({ libraryId: projectLibraries.libraryId })
      .from(projectLibraries)
      .where(eq(projectLibraries.projectId, projectId))
      .all()
    const libraryIds = linkedLibraries.map(l => l.libraryId)

    const result = streamText({
      model,
      system: systemPrompt,
      messages: compaction.messages,
      stopWhen: stepCountIs(5),
      tools: {
        ask_question: askQuestionTool,

        get_template: tool({
          description: 'Retrieve the activity template\'s input schema (field definitions), the activity\'s current data, and the component source. Call this to understand what fields need to be filled in. ALWAYS call this before making updates.',
          inputSchema: z.object({}),
          execute: async () => {
            // Re-fetch to get latest state
            const current = db.select().from(activities).where(eq(activities.id, activityId)).get()
            const currentTmpl = db.select().from(templates).where(eq(templates.id, activity.templateId)).get()

            if (!current || !currentTmpl) {
              return { error: 'Activity or template not found' }
            }

            // Get versioned template data - use the version the activity's data is on
            const activityDataVersion = current.dataSchemaVersion ?? 1
            const latestTemplateVersion = currentTmpl.schemaVersion

            // If activity is on an older version, fetch that version's schema/component
            let templateData: {
              inputSchema: unknown
              component: string | null
              sampleData: unknown
            }

            if (activityDataVersion < latestTemplateVersion) {
              // Fetch the specific version the activity is using
              const version = db
                .select()
                .from(templateVersions)
                .where(
                  and(
                    eq(templateVersions.templateId, currentTmpl.id),
                    eq(templateVersions.version, activityDataVersion),
                  ),
                )
                .get()

              if (version) {
                templateData = {
                  inputSchema: version.inputSchema,
                  component: version.component,
                  sampleData: version.sampleData,
                }
              }
              else {
                // Fallback to current template if version not found
                templateData = {
                  inputSchema: currentTmpl.inputSchema,
                  component: currentTmpl.component,
                  sampleData: currentTmpl.sampleData,
                }
              }
            }
            else {
              // Activity is on latest version
              templateData = {
                inputSchema: currentTmpl.inputSchema,
                component: currentTmpl.component,
                sampleData: currentTmpl.sampleData,
              }
            }

            // Update timestamps for stale context detection and track what version we told the LLM about
            db.update(activities)
              .set({
                dataLastReadAt: new Date(),
                chatSchemaVersion: activityDataVersion,
              })
              .where(eq(activities.id, activityId))
              .run()

            return {
              activityName: current.name,
              activityDescription: current.description,
              currentData: current.data ?? {},
              inputSchema: templateData.inputSchema,
              component: templateData.component,
              sampleData: templateData.sampleData,
              templateName: currentTmpl.name,
              // Version info
              dataSchemaVersion: activityDataVersion,
              latestTemplateVersion,
              upgradeAvailable: activityDataVersion < latestTemplateVersion,
            }
          },
        }),

        update_activity: tool({
          description: 'Update the activity\'s data fields. Provide a data object with field values matching the template\'s input schema. Fields you include will replace existing values. You can also update the activity name and description. You MUST call get_template first to read the current state.',
          inputSchema: z.object({
            data: z.record(z.string(), z.unknown()).optional().describe('Activity data fields. Keys must match the field IDs from the template\'s input schema.'),
            name: z.string().optional().describe('Updated activity name'),
            description: z.string().optional().describe('Updated activity description'),
          }),
          execute: async ({ data: newData, name, description }) => {
            const current = db.select().from(activities).where(eq(activities.id, activityId)).get()
            if (!current) return { success: false, error: 'Activity not found' }

            // Check for stale context (only if there was a previous modification)
            if (current.dataLastModifiedAt) {
              const lastMod = current.dataLastModifiedAt.getTime()
              const lastRead = current.dataLastReadAt?.getTime() ?? 0

              if (lastMod > lastRead) {
                return {
                  success: false,
                  error: `Activity data has been modified since it was last read.\n`
                    + `Last modification: ${current.dataLastModifiedAt.toISOString()}\n`
                    + `Last read: ${current.dataLastReadAt?.toISOString() ?? 'never'}\n\n`
                    + `Please call get_template to read the current state before making changes.`,
                }
              }
            }

            const updatePayload: Record<string, unknown> = {
              updatedAt: new Date(),
              dataLastModifiedAt: new Date(),
              dataLastReadAt: null, // Force re-read before next modification
            }

            if (newData) {
              // Merge new data with existing data
              const merged = { ...(current.data as Record<string, unknown> ?? {}), ...newData }
              updatePayload.data = merged
            }
            if (name) updatePayload.name = name
            if (description !== undefined) updatePayload.description = description

            db.update(activities)
              .set(updatePayload)
              .where(eq(activities.id, activityId))
              .run()

            // Check for HTML in text/textarea fields (non-blocking warnings)
            const currentTmpl = db.select().from(templates).where(eq(templates.id, current.templateId)).get()
            if (currentTmpl?.inputSchema) {
              const mergedData = newData
                ? { ...(current.data as Record<string, unknown> ?? {}), ...newData }
                : current.data as Record<string, unknown> ?? {}
              const warnings = checkHtmlInSampleData(
                currentTmpl.inputSchema as TemplateField[],
                mergedData,
              )
              if (warnings.length > 0) {
                return { success: true, warnings: warnings.map(w => w.message) }
              }
            }

            return { success: true }
          },
        }),

        search_libraries: tool({
          description: 'Search across all reference libraries linked to this project. Returns the most relevant content chunks ranked by semantic similarity. Use this to find accurate content for populating activity fields.',
          inputSchema: z.object({
            query: z.string().describe('Natural language search query describing the content you\'re looking for'),
            limit: z.number().optional().default(10).describe('Maximum number of results to return (default 10, max 30)'),
          }),
          execute: async ({ query, limit: requestedLimit }) => {
            if (libraryIds.length === 0) {
              return { results: [], message: 'No libraries are linked to this project. The user should link libraries in the project settings.' }
            }

            const safeLimit = Math.min(requestedLimit ?? 10, 30)

            // Generate embedding for the search query
            const queryEmbedding = await generateEmbedding(query)

            // Get all chunks with embeddings from linked libraries
            const chunks = db
              .select({
                id: documentChunks.id,
                documentId: documentChunks.documentId,
                libraryId: documentChunks.libraryId,
                text: documentChunks.text,
                chunkIndex: documentChunks.chunkIndex,
                embedding: documentChunks.embedding,
              })
              .from(documentChunks)
              .where(
                and(
                  inArray(documentChunks.libraryId, libraryIds),
                  isNotNull(documentChunks.embedding),
                ),
              )
              .all()

            // Compute cosine similarity and rank
            const scored = chunks
              .map((chunk) => {
                const embedding = chunk.embedding as number[] | null
                if (!embedding) return null
                return {
                  text: chunk.text,
                  documentId: chunk.documentId,
                  score: cosineSimilarity(queryEmbedding, embedding),
                }
              })
              .filter((item): item is NonNullable<typeof item> => item !== null)
              .sort((a, b) => b.score - a.score)
              .slice(0, safeLimit)

            // Enrich with document metadata
            const docIds = [...new Set(scored.map(s => s.documentId))]
            const docs = docIds.length > 0
              ? db
                  .select({
                    id: documents.id,
                    title: documents.title,
                    sourceType: documents.sourceType,
                  })
                  .from(documents)
                  .all()
                  .filter(d => docIds.includes(d.id))
              : []
            const docMap = new Map(docs.map(d => [d.id, d]))

            return {
              results: scored.map(r => ({
                text: r.text,
                score: Math.round(r.score * 1000) / 1000,
                document: docMap.get(r.documentId) ?? null,
              })),
            }
          },
        }),
      },
      maxOutputTokens: 16384,
      onFinish: async ({ totalUsage }) => {
        // Record token usage to database
        if (totalUsage) {
          const promptTokens = totalUsage.inputTokens ?? 0
          const completionTokens = totalUsage.outputTokens ?? 0
          await recordTokenUsage({
            entityType: 'activity',
            entityId: activityId,
            providerId: provider?.id ?? null,
            modelId: model.modelId ?? 'unknown',
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
            wasCompacted: compaction.wasCompacted,
          })
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
