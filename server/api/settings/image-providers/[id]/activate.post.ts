import { eq } from 'drizzle-orm'
import { imageProviders } from '~~/server/database/schema'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Provider ID is required' })
  }

  const db = useDb()
  const now = new Date()

  const existing = db.select().from(imageProviders).where(eq(imageProviders.id, id)).get()
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Provider not found' })
  }

  // Deactivate all providers, then activate the requested one
  db.update(imageProviders)
    .set({ isActive: false, updatedAt: now })
    .run()

  db.update(imageProviders)
    .set({ isActive: true, updatedAt: now })
    .where(eq(imageProviders.id, id))
    .run()

  return db.select().from(imageProviders).where(eq(imageProviders.id, id)).get()
})
