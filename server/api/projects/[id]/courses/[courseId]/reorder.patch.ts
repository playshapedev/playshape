import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { courses, courseSections } from '~~/server/database/schema'

const reorderSchema = z.object({
  sectionIds: z.array(z.string()).min(1, 'At least one section ID is required'),
})

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'id')
  const courseId = getRouterParam(event, 'courseId')
  if (!projectId || !courseId) {
    throw createError({ statusCode: 400, statusMessage: 'Project ID and Course ID are required' })
  }

  const body = await readBody(event)
  const parsed = reorderSchema.parse(body)

  const db = useDb()

  // Verify course belongs to project
  const course = db.select().from(courses).where(eq(courses.id, courseId)).get()
  if (!course || course.projectId !== projectId) {
    throw createError({ statusCode: 404, statusMessage: 'Course not found' })
  }

  const now = new Date()

  // Update sort order for each section
  for (const [i, sectionId] of parsed.sectionIds.entries()) {
    db.update(courseSections)
      .set({ sortOrder: i, updatedAt: now })
      .where(eq(courseSections.id, sectionId))
      .run()
  }

  return { success: true }
})
