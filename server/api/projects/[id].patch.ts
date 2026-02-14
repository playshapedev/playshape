import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { projects } from '~~/server/database/schema'

const updateProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required').optional(),
  description: z.string().optional(),
})

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Project ID is required' })
  }

  const body = await readBody(event)
  const parsed = updateProjectSchema.parse(body)

  const db = useDb()

  const existing = db.select().from(projects).where(eq(projects.id, id)).get()
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  }

  db.update(projects)
    .set({
      ...parsed,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, id))
    .run()

  return db.select().from(projects).where(eq(projects.id, id)).get()
})
