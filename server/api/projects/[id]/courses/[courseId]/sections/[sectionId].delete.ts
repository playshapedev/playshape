import { eq, count } from 'drizzle-orm'
import { courses, courseSections } from '~~/server/database/schema'

export default defineEventHandler((event) => {
  const projectId = getRouterParam(event, 'id')
  const courseId = getRouterParam(event, 'courseId')
  const sectionId = getRouterParam(event, 'sectionId')
  if (!projectId || !courseId || !sectionId) {
    throw createError({ statusCode: 400, statusMessage: 'Project ID, Course ID, and Section ID are required' })
  }

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

  // Don't allow deleting the last section
  const sectionCount = db
    .select({ total: count() })
    .from(courseSections)
    .where(eq(courseSections.courseId, courseId))
    .get()

  if ((sectionCount?.total ?? 0) <= 1) {
    throw createError({ statusCode: 400, statusMessage: 'Cannot delete the only section in a course' })
  }

  // Cascade delete will remove activities in this section
  db.delete(courseSections).where(eq(courseSections.id, sectionId)).run()

  setResponseStatus(event, 204)
  return null
})
