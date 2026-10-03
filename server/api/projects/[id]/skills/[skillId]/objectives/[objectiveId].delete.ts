import { eq, and } from 'drizzle-orm'
import { skills, objectives } from '~~/server/database/schema'

export default defineEventHandler((event) => {
  const projectId = getRouterParam(event, 'id')
  const skillId = getRouterParam(event, 'skillId')
  const objectiveId = getRouterParam(event, 'objectiveId')
  if (!projectId || !skillId || !objectiveId) {
    throw createError({ statusCode: 400, statusMessage: 'Project ID, Skill ID, and Objective ID are required' })
  }

  const db = useDb()

  const skill = db.select().from(skills)
    .where(and(eq(skills.id, skillId), eq(skills.projectId, projectId)))
    .get()
  if (!skill) {
    throw createError({ statusCode: 404, statusMessage: 'Skill not found' })
  }

  const where = and(eq(objectives.id, objectiveId), eq(objectives.skillId, skillId))
  const existing = db.select().from(objectives).where(where).get()
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Objective not found' })
  }

  db.delete(objectives).where(where).run()

  setResponseStatus(event, 204)
  return null
})
