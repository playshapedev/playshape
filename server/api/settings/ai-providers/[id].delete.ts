import { eq } from 'drizzle-orm'
import { aiProviders } from '~~/server/database/schema'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Provider ID is required' })
  }

  const db = useDb()

  const existing = db.select().from(aiProviders).where(eq(aiProviders.id, id)).get()
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Provider not found' })
  }

  // Models are cascade deleted via foreign key
  db.delete(aiProviders).where(eq(aiProviders.id, id)).run()

  setResponseStatus(event, 204)
  return null
})
