import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { courses, courseSections, activities } from '~~/server/database/schema'
import type { TemplateMessage } from '~~/server/database/schema'

const updateActivitySchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  messages: z.array(z.unknown()).optional().transform(v => v as TemplateMessage[] | undefined),
  sortOrder: z.number().int().optional(),
})

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'id')
  const courseId = getRouterParam(event, 'courseId')
  const activityId = getRouterParam(event, 'activityId')
  if (!projectId || !courseId || !activityId) {
    throw createError({ statusCode: 400, statusMessage: 'Project ID, Course ID, and Activity ID are required' })
  }

  const body = await readBody(event)
  const parsed = updateActivitySchema.parse(body)

  const db = useDb()

  // Verify course belongs to project
  const course = db.select().from(courses).where(eq(courses.id, courseId)).get()
  if (!course || course.projectId !== projectId) {
    throw createError({ statusCode: 404, statusMessage: 'Course not found' })
  }

  // Fetch and verify activity
  const existing = db.select().from(activities).where(eq(activities.id, activityId)).get()
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Activity not found' })
  }

  const section = db.select().from(courseSections).where(eq(courseSections.id, existing.sectionId)).get()
  if (!section || section.courseId !== courseId) {
    throw createError({ statusCode: 404, statusMessage: 'Activity not found in this course' })
  }

  db.update(activities)
    .set({
      ...parsed,
      updatedAt: new Date(),
    })
    .where(eq(activities.id, activityId))
    .run()

  return db.select().from(activities).where(eq(activities.id, activityId)).get()
})
