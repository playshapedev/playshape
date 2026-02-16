import { eq } from 'drizzle-orm'
import { courses } from '~~/server/database/schema'

export default defineEventHandler((event) => {
  const projectId = getRouterParam(event, 'id')
  const courseId = getRouterParam(event, 'courseId')
  if (!projectId || !courseId) {
    throw createError({ statusCode: 400, statusMessage: 'Project ID and Course ID are required' })
  }

  const db = useDb()

  const existing = db.select().from(courses).where(eq(courses.id, courseId)).get()
  if (!existing || existing.projectId !== projectId) {
    throw createError({ statusCode: 404, statusMessage: 'Course not found' })
  }

  // Cascade delete will remove sections and their activities
  db.delete(courses).where(eq(courses.id, courseId)).run()

  setResponseStatus(event, 204)
  return null
})
