import { eq, and } from 'drizzle-orm'
import { skills } from '~~/server/database/schema'

export default defineEventHandler((event) => {
  const projectId = getRouterParam(event, 'id')
  const skillId = getRouterParam(event, 'skillId')
  if (!projectId || !skillId) {
    throw createError({ statusCode: 400, statusMessage: 'Project ID and Skill ID are required' })
  }

  const db = useDb()
  const where = and(eq(skills.id, skillId), eq(skills.projectId, projectId))

  const existing = db.select().from(skills).where(where).get()
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Skill not found' })
  }

  // Objectives and activity links cascade
  db.delete(skills).where(where).run()

  setResponseStatus(event, 204)
  return null
})
