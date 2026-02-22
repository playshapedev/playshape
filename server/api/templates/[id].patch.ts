import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { templates, TEMPLATE_KINDS } from '~~/server/database/schema'

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

  db.update(templates)
    .set(updatePayload)
    .where(eq(templates.id, id))
    .run()

  return db.select().from(templates).where(eq(templates.id, id)).get()
})
