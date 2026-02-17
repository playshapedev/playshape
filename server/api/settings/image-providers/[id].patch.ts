import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { imageProviders, IMAGE_PROVIDER_TYPES } from '~~/server/database/schema'

const updateProviderSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(IMAGE_PROVIDER_TYPES).optional(),
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

  const existing = db.select().from(imageProviders).where(eq(imageProviders.id, id)).get()
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Provider not found' })
  }

  db.update(imageProviders)
    .set({
      ...parsed,
      updatedAt: new Date(),
    })
    .where(eq(imageProviders.id, id))
    .run()

  return db.select().from(imageProviders).where(eq(imageProviders.id, id)).get()
})
