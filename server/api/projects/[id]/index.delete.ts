import { eq } from 'drizzle-orm'
import { projects } from '~~/server/database/schema'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Project ID is required' })
  }

  const db = useDb()

  const existing = db.select().from(projects).where(eq(projects.id, id)).get()
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  }

  db.delete(projects).where(eq(projects.id, id)).run()

  setResponseStatus(event, 204)
  return null
})
