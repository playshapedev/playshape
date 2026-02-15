import { eq } from 'drizzle-orm'
import { templates } from '~~/server/database/schema'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Template ID is required' })
  }

  const db = useDb()

  const existing = db.select().from(templates).where(eq(templates.id, id)).get()
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Template not found' })
  }

  db.delete(templates).where(eq(templates.id, id)).run()

  return { ok: true }
})
