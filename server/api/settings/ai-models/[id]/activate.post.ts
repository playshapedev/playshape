import { eq } from 'drizzle-orm'
import { aiModels } from '~~/server/database/schema'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Model ID is required' })
  }

  const db = useDb()
  const now = new Date()

  const existing = db.select().from(aiModels).where(eq(aiModels.id, id)).get()
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Model not found' })
  }

  // Deactivate all models with the same purpose, then activate this one
  db.update(aiModels)
    .set({ isActive: false, updatedAt: now })
    .where(eq(aiModels.purpose, existing.purpose))
    .run()

  db.update(aiModels)
    .set({ isActive: true, updatedAt: now })
    .where(eq(aiModels.id, id))
    .run()

  return db.select().from(aiModels).where(eq(aiModels.id, id)).get()
})
