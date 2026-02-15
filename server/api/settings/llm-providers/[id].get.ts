import { eq } from 'drizzle-orm'
import { llmProviders } from '~~/server/database/schema'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Provider ID is required' })
  }

  const db = useDb()
  const provider = db.select().from(llmProviders).where(eq(llmProviders.id, id)).get()

  if (!provider) {
    throw createError({ statusCode: 404, statusMessage: 'Provider not found' })
  }

  return provider
})
