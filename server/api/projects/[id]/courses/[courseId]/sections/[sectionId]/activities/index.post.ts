import { z } from 'zod'
import { eq, count } from 'drizzle-orm'
import { courses, courseSections, activities, templates } from '~~/server/database/schema'

const createActivitySchema = z.object({
  name: z.string().min(1, 'Activity name is required'),
  templateId: z.string().min(1, 'Template ID is required'),
  description: z.string().nullable().optional(),
})

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'id')
  const courseId = getRouterParam(event, 'courseId')
  const sectionId = getRouterParam(event, 'sectionId')
  if (!projectId || !courseId || !sectionId) {
    throw createError({ statusCode: 400, statusMessage: 'Project ID, Course ID, and Section ID are required' })
  }

  const body = await readBody(event)
  const parsed = createActivitySchema.parse(body)

  const db = useDb()

  // Verify course belongs to project
  const course = db.select().from(courses).where(eq(courses.id, courseId)).get()
  if (!course || course.projectId !== projectId) {
    throw createError({ statusCode: 404, statusMessage: 'Course not found' })
  }

  // Verify section belongs to course
  const section = db.select().from(courseSections).where(eq(courseSections.id, sectionId)).get()
  if (!section || section.courseId !== courseId) {
    throw createError({ statusCode: 404, statusMessage: 'Section not found' })
  }

  // Verify template exists and is an activity template
  const tmpl = db.select().from(templates).where(eq(templates.id, parsed.templateId)).get()
  if (!tmpl) {
    throw createError({ statusCode: 404, statusMessage: 'Template not found' })
  }
  if (tmpl.kind !== 'activity') {
    throw createError({ statusCode: 400, statusMessage: 'Template must be an activity template' })
  }

  // Determine sort order
  const countResult = db
    .select({ total: count() })
    .from(activities)
    .where(eq(activities.sectionId, sectionId))
    .get()
  const nextOrder = countResult?.total ?? 0

  const now = new Date()
  const activityId = crypto.randomUUID()

  // Initialize data from template's sampleData as starting point
  const initialData = tmpl.sampleData ?? {}

  db.insert(activities).values({
    id: activityId,
    sectionId,
    templateId: parsed.templateId,
    name: parsed.name,
    description: parsed.description ?? null,
    data: initialData,
    messages: [],
    sortOrder: nextOrder,
    createdAt: now,
    updatedAt: now,
  }).run()

  return db.select().from(activities).where(eq(activities.id, activityId)).get()
})
