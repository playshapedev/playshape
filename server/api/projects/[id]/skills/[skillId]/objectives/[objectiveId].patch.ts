import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { skills, objectives } from '~~/server/database/schema'

const updateObjectiveSchema = z.object({
  statement: z.string().trim().min(1).optional(),
  conditions: z.string().trim().nullable().optional(),
  criteria: z.string().trim().nullable().optional(),
  sortOrder: z.number().int().optional(),
})

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'id')
  const skillId = getRouterParam(event, 'skillId')
  const objectiveId = getRouterParam(event, 'objectiveId')
  if (!projectId || !skillId || !objectiveId) {
    throw createError({ statusCode: 400, statusMessage: 'Project ID, Skill ID, and Objective ID are required' })
  }

  const body = await readBody(event)
  const parsed = updateObjectiveSchema.parse(body)

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

  // Store blank optional fields as null
  const updates: Partial<typeof objectives.$inferInsert> = { ...parsed, updatedAt: new Date() }
  if (parsed.conditions !== undefined) updates.conditions = parsed.conditions || null
  if (parsed.criteria !== undefined) updates.criteria = parsed.criteria || null

  db.update(objectives).set(updates).where(where).run()

  return db.select().from(objectives).where(where).get()
})
