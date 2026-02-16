import { eq } from 'drizzle-orm'
import { brands } from '~~/server/database/schema'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Brand ID is required' })
  }

  const db = useDb()

  const existing = db.select().from(brands).where(eq(brands.id, id)).get()
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Brand not found' })
  }

  db.delete(brands).where(eq(brands.id, id)).run()

  setResponseStatus(event, 204)
  return null
})
