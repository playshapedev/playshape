import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { templates, templateVersions, TEMPLATE_KINDS, type TemplateField } from '~~/server/database/schema'
import { hasSchemaChanged } from '~~/server/utils/schemaEquality'

const updateTemplateSchema = z.object({
  kind: z.enum(TEMPLATE_KINDS).optional(),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  inputSchema: z.any().optional(),
  component: z.string().optional().nullable(),
  sampleData: z.any().optional(),
  dependencies: z.any().optional(),
  tools: z.array(z.string()).optional(),
  messages: z.any().optional(),
  thumbnail: z.string().optional().nullable(),
  status: z.enum(['draft', 'published']).optional(),
})

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Template ID is required' })
  }

  const body = await readBody(event)
  const parsed = updateTemplateSchema.parse(body)

  const db = useDb()

  const existing = db.select().from(templates).where(eq(templates.id, id)).get()
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Template not found' })
  }

  // Check if inputSchema is being changed structurally
  // If so, reject the direct PATCH and require going through the chat flow
  if (parsed.inputSchema !== undefined) {
    const schemaChanged = hasSchemaChanged(
      existing.inputSchema as TemplateField[] | null,
      parsed.inputSchema as TemplateField[] | null,
    )
    if (schemaChanged) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Structural changes to inputSchema must be made through the template chat to ensure proper versioning and migration.',
      })
    }
  }

  // If messages are being cleared, also reset the stale context timestamps
  // since the LLM loses context of previous get_template reads
  const updatePayload: Record<string, unknown> = {
    ...parsed,
    updatedAt: new Date(),
  }

  if (Array.isArray(parsed.messages) && parsed.messages.length === 0) {
    updatePayload.componentLastReadAt = null
    updatePayload.componentLastModifiedAt = null
  }

  // Update the template
  db.update(templates)
    .set(updatePayload)
    .where(eq(templates.id, id))
    .run()

  // Update the current version snapshot with versionable fields
  const versionUpdatePayload: Record<string, unknown> = {}
  if (parsed.inputSchema !== undefined) versionUpdatePayload.inputSchema = parsed.inputSchema
  if (parsed.component !== undefined) versionUpdatePayload.component = parsed.component
  if (parsed.sampleData !== undefined) versionUpdatePayload.sampleData = parsed.sampleData
  if (parsed.dependencies !== undefined) versionUpdatePayload.dependencies = parsed.dependencies
  if (parsed.tools !== undefined) versionUpdatePayload.tools = parsed.tools

  if (Object.keys(versionUpdatePayload).length > 0) {
    db.update(templateVersions)
      .set(versionUpdatePayload)
      .where(
        and(
          eq(templateVersions.templateId, id),
          eq(templateVersions.version, existing.schemaVersion),
        ),
      )
      .run()
  }

  return db.select().from(templates).where(eq(templates.id, id)).get()
})
