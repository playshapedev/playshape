import { z } from 'zod'
import { eq, count } from 'drizzle-orm'
import { courses, courseSections } from '~~/server/database/schema'

const createCourseSchema = z.object({
  name: z.string().min(1, 'Course name is required'),
  description: z.string().nullable().optional(),
  templateId: z.string().nullable().optional(),
})

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'id')
  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: 'Project ID is required' })
  }

  const body = await readBody(event)
  const parsed = createCourseSchema.parse(body)

  const db = useDb()
  const now = new Date()

  // Determine sort order: append after existing courses
  const countResult = db
    .select({ total: count() })
    .from(courses)
    .where(eq(courses.projectId, projectId))
    .get()
  const nextOrder = countResult?.total ?? 0

  const courseId = crypto.randomUUID()
  const sectionId = crypto.randomUUID()

  // Create the course
  db.insert(courses).values({
    id: courseId,
    projectId,
    name: parsed.name,
    description: parsed.description ?? null,
    templateId: parsed.templateId ?? null,
    sortOrder: nextOrder,
    createdAt: now,
    updatedAt: now,
  }).run()

  // Create the default section (null title)
  db.insert(courseSections).values({
    id: sectionId,
    courseId,
    title: null,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
  }).run()

  return db.select().from(courses).where(eq(courses.id, courseId)).get()
})
