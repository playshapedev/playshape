import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { courses } from '~~/server/database/schema'

const updateCourseSchema = z.object({
  name: z.string().min(1, 'Course name is required').optional(),
  description: z.string().nullable().optional(),
  templateId: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
})

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'id')
  const courseId = getRouterParam(event, 'courseId')
  if (!projectId || !courseId) {
    throw createError({ statusCode: 400, statusMessage: 'Project ID and Course ID are required' })
  }

  const body = await readBody(event)
  const parsed = updateCourseSchema.parse(body)

  const db = useDb()

  const existing = db.select().from(courses).where(eq(courses.id, courseId)).get()
  if (!existing || existing.projectId !== projectId) {
    throw createError({ statusCode: 404, statusMessage: 'Course not found' })
  }

  db.update(courses)
    .set({
      ...parsed,
      updatedAt: new Date(),
    })
    .where(eq(courses.id, courseId))
    .run()

  return db.select().from(courses).where(eq(courses.id, courseId)).get()
})
