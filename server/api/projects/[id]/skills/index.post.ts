import { z } from 'zod'
import { eq, max } from 'drizzle-orm'
import { projects, skills } from '~~/server/database/schema'

const createSkillSchema = z.object({
  name: z.string().trim().min(1, 'Skill name is required'),
  description: z.string().optional(),
})

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'id')
  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: 'Project ID is required' })
  }

  const parsed = await readValidatedBody(event, createSkillSchema.parse)

  const db = useDb()

  const project = db.select().from(projects).where(eq(projects.id, projectId)).get()
  if (!project) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  }

  // Append after existing skills (max + 1 so deletions don't cause collisions)
  const lastOrder = db
    .select({ value: max(skills.sortOrder) })
    .from(skills)
    .where(eq(skills.projectId, projectId))
    .get()

  const now = new Date()
  const id = crypto.randomUUID()

  db.insert(skills).values({
    id,
    projectId,
    name: parsed.name,
    description: parsed.description ?? '',
    sortOrder: (lastOrder?.value ?? -1) + 1,
    createdAt: now,
    updatedAt: now,
  }).run()

  return db.select().from(skills).where(eq(skills.id, id)).get()
})
