import { eq } from 'drizzle-orm'
import { aiModels } from '~~/server/database/schema'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Model ID is required' })
  }

  const db = useDb()

  const existing = db.select().from(aiModels).where(eq(aiModels.id, id)).get()
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Model not found' })
  }

  db.delete(aiModels).where(eq(aiModels.id, id)).run()

  setResponseStatus(event, 204)
  return null
})
