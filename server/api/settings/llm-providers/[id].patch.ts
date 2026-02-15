import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { llmProviders, LLM_PROVIDER_TYPES } from '~~/server/database/schema'

const updateProviderSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(LLM_PROVIDER_TYPES).optional(),
  baseUrl: z.string().url().optional().nullable(),
  apiKey: z.string().optional().nullable(),
  model: z.string().min(1).optional(),
})

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Provider ID is required' })
  }

  const body = await readBody(event)
  const parsed = updateProviderSchema.parse(body)

  const db = useDb()

  const existing = db.select().from(llmProviders).where(eq(llmProviders.id, id)).get()
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Provider not found' })
  }

  db.update(llmProviders)
    .set({
      ...parsed,
      updatedAt: new Date(),
    })
    .where(eq(llmProviders.id, id))
    .run()

  return db.select().from(llmProviders).where(eq(llmProviders.id, id)).get()
})
