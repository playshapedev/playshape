import { z } from 'zod'
import { eq, and, max } from 'drizzle-orm'
import { skills, objectives } from '~~/server/database/schema'

const createObjectiveSchema = z.object({
  statement: z.string().trim().min(1, 'Objective statement is required'),
  conditions: z.string().trim().nullable().optional(),
  criteria: z.string().trim().nullable().optional(),
})

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'id')
  const skillId = getRouterParam(event, 'skillId')
  if (!projectId || !skillId) {
    throw createError({ statusCode: 400, statusMessage: 'Project ID and Skill ID are required' })
  }

  const parsed = await readValidatedBody(event, createObjectiveSchema.parse)

  const db = useDb()

  const skill = db.select().from(skills)
    .where(and(eq(skills.id, skillId), eq(skills.projectId, projectId)))
    .get()
  if (!skill) {
    throw createError({ statusCode: 404, statusMessage: 'Skill not found' })
  }

  const lastOrder = db
    .select({ value: max(objectives.sortOrder) })
    .from(objectives)
    .where(eq(objectives.skillId, skillId))
    .get()

  const now = new Date()
  const id = crypto.randomUUID()

  db.insert(objectives).values({
    id,
    skillId,
    statement: parsed.statement,
    conditions: parsed.conditions || null,
    criteria: parsed.criteria || null,
    sortOrder: (lastOrder?.value ?? -1) + 1,
    createdAt: now,
    updatedAt: now,
  }).run()

  return db.select().from(objectives).where(eq(objectives.id, id)).get()
})
