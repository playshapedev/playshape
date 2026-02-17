import { eq } from 'drizzle-orm'
import { imageProviders } from '~~/server/database/schema'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Provider ID is required' })
  }

  const db = useDb()

  const existing = db.select().from(imageProviders).where(eq(imageProviders.id, id)).get()
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Provider not found' })
  }

  db.delete(imageProviders).where(eq(imageProviders.id, id)).run()

  setResponseStatus(event, 204)
  return null
})
