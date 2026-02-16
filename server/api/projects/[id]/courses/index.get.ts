import { eq, asc, count, inArray } from 'drizzle-orm'
import { courses, courseSections, activities, templates } from '~~/server/database/schema'

export default defineEventHandler((event) => {
  const projectId = getRouterParam(event, 'id')
  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: 'Project ID is required' })
  }

  const db = useDb()

  // Fetch courses with template names
  const rows = db
    .select({
      id: courses.id,
      name: courses.name,
      description: courses.description,
      templateId: courses.templateId,
      templateName: templates.name,
      sortOrder: courses.sortOrder,
      createdAt: courses.createdAt,
      updatedAt: courses.updatedAt,
    })
    .from(courses)
    .leftJoin(templates, eq(courses.templateId, templates.id))
    .where(eq(courses.projectId, projectId))
    .orderBy(asc(courses.sortOrder), asc(courses.createdAt))
    .all()

  if (rows.length === 0) return []

  // Get activity counts per course via sections
  const courseIds = rows.map(r => r.id)
  const activityCounts = db
    .select({
      courseId: courseSections.courseId,
      activityCount: count(activities.id),
    })
    .from(courseSections)
    .leftJoin(activities, eq(activities.sectionId, courseSections.id))
    .where(inArray(courseSections.courseId, courseIds))
    .groupBy(courseSections.courseId)
    .all()

  const countMap = new Map(activityCounts.map(r => [r.courseId, r.activityCount]))

  return rows.map(row => ({
    ...row,
    activityCount: countMap.get(row.id) ?? 0,
  }))
})
