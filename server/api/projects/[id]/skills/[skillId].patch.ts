import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { skills } from '~~/server/database/schema'

const updateSkillSchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().optional(),
  sortOrder: z.number().int().optional(),
})

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'id')
  const skillId = getRouterParam(event, 'skillId')
  if (!projectId || !skillId) {
    throw createError({ statusCode: 400, statusMessage: 'Project ID and Skill ID are required' })
  }

  const body = await readBody(event)
  const parsed = updateSkillSchema.parse(body)

  const db = useDb()
  const where = and(eq(skills.id, skillId), eq(skills.projectId, projectId))

  const existing = db.select().from(skills).where(where).get()
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Skill not found' })
  }

  db.update(skills)
    .set({ ...parsed, updatedAt: new Date() })
    .where(where)
    .run()

  return db.select().from(skills).where(where).get()
})
