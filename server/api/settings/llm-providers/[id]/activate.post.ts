import { eq } from 'drizzle-orm'
import { llmProviders } from '~~/server/database/schema'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Provider ID is required' })
  }

  const db = useDb()
  const now = new Date()

  const existing = db.select().from(llmProviders).where(eq(llmProviders.id, id)).get()
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Provider not found' })
  }

  // Deactivate all providers, then activate the requested one
  db.update(llmProviders)
    .set({ isActive: false, updatedAt: now })
    .run()

  db.update(llmProviders)
    .set({ isActive: true, updatedAt: now })
    .where(eq(llmProviders.id, id))
    .run()

  return db.select().from(llmProviders).where(eq(llmProviders.id, id)).get()
})
