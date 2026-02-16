import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { courses, courseSections } from '~~/server/database/schema'

const updateSectionSchema = z.object({
  title: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
})

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'id')
  const courseId = getRouterParam(event, 'courseId')
  const sectionId = getRouterParam(event, 'sectionId')
  if (!projectId || !courseId || !sectionId) {
    throw createError({ statusCode: 400, statusMessage: 'Project ID, Course ID, and Section ID are required' })
  }

  const body = await readBody(event)
  const parsed = updateSectionSchema.parse(body)

  const db = useDb()

  // Verify course belongs to project
  const course = db.select().from(courses).where(eq(courses.id, courseId)).get()
  if (!course || course.projectId !== projectId) {
    throw createError({ statusCode: 404, statusMessage: 'Course not found' })
  }

  // Verify section belongs to course
  const existing = db.select().from(courseSections).where(eq(courseSections.id, sectionId)).get()
  if (!existing || existing.courseId !== courseId) {
    throw createError({ statusCode: 404, statusMessage: 'Section not found' })
  }

  db.update(courseSections)
    .set({
      ...parsed,
      updatedAt: new Date(),
    })
    .where(eq(courseSections.id, sectionId))
    .run()

  return db.select().from(courseSections).where(eq(courseSections.id, sectionId)).get()
})
