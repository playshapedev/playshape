import { eq } from 'drizzle-orm'
import { templates } from '~~/server/database/schema'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Template ID is required' })
  }

  const db = useDb()
  const template = db.select().from(templates).where(eq(templates.id, id)).get()

  if (!template) {
    throw createError({ statusCode: 404, statusMessage: 'Template not found' })
  }

  return template
})
