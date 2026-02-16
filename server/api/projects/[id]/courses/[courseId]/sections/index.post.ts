import { z } from 'zod'
import { eq, count } from 'drizzle-orm'
import { courses, courseSections } from '~~/server/database/schema'

const createSectionSchema = z.object({
  title: z.string().nullable().optional(),
})

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'id')
  const courseId = getRouterParam(event, 'courseId')
  if (!projectId || !courseId) {
    throw createError({ statusCode: 400, statusMessage: 'Project ID and Course ID are required' })
  }

  const body = await readBody(event)
  const parsed = createSectionSchema.parse(body)

  const db = useDb()

  // Verify course exists and belongs to project
  const course = db.select().from(courses).where(eq(courses.id, courseId)).get()
  if (!course || course.projectId !== projectId) {
    throw createError({ statusCode: 404, statusMessage: 'Course not found' })
  }

  // Determine sort order
  const countResult = db
    .select({ total: count() })
    .from(courseSections)
    .where(eq(courseSections.courseId, courseId))
    .get()
  const nextOrder = countResult?.total ?? 0

  const now = new Date()
  const sectionId = crypto.randomUUID()

  db.insert(courseSections).values({
    id: sectionId,
    courseId,
    title: parsed.title ?? null,
    sortOrder: nextOrder,
    createdAt: now,
    updatedAt: now,
  }).run()

  return db.select().from(courseSections).where(eq(courseSections.id, sectionId)).get()
})
