import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { templates } from '~~/server/database/schema'

const updateTemplateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  inputSchema: z.any().optional(),
  component: z.string().optional().nullable(),
  sampleData: z.any().optional(),
  dependencies: z.any().optional(),
  tools: z.array(z.string()).optional(),
  messages: z.any().optional(),
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

  db.update(templates)
    .set({
      ...parsed,
      updatedAt: new Date(),
    })
    .where(eq(templates.id, id))
    .run()

  return db.select().from(templates).where(eq(templates.id, id)).get()
})
