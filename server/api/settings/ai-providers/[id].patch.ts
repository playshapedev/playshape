import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { aiProviders } from '~~/server/database/schema'

const updateProviderSchema = z.object({
  name: z.string().min(1).optional(),
  baseUrl: z.string().url().optional().nullable(),
  apiKey: z.string().optional().nullable(),
})

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Provider ID is required' })
  }

  const body = await readBody(event)
  const parsed = updateProviderSchema.parse(body)

  const db = useDb()

  const existing = db.select().from(aiProviders).where(eq(aiProviders.id, id)).get()
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Provider not found' })
  }

  db.update(aiProviders)
    .set({
      ...parsed,
      updatedAt: new Date(),
    })
    .where(eq(aiProviders.id, id))
    .run()

  return db.select().from(aiProviders).where(eq(aiProviders.id, id)).get()
})
