import { eq, asc, inArray } from 'drizzle-orm'
import { courses, courseSections, activities, templates } from '~~/server/database/schema'

export default defineEventHandler((event) => {
  const projectId = getRouterParam(event, 'id')
  const courseId = getRouterParam(event, 'courseId')
  if (!projectId || !courseId) {
    throw createError({ statusCode: 400, statusMessage: 'Project ID and Course ID are required' })
  }

  const db = useDb()

  // Fetch course with template info
  const course = db
    .select({
      id: courses.id,
      projectId: courses.projectId,
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
    .where(eq(courses.id, courseId))
    .get()

  if (!course || course.projectId !== projectId) {
    throw createError({ statusCode: 404, statusMessage: 'Course not found' })
  }

  // Fetch sections ordered by sortOrder
  const sections = db
    .select()
    .from(courseSections)
    .where(eq(courseSections.courseId, courseId))
    .orderBy(asc(courseSections.sortOrder), asc(courseSections.createdAt))
    .all()

  // Fetch activities for all sections of this course, with template names
  const sectionIds = sections.map(s => s.id)
  const courseActivities = sectionIds.length > 0
    ? db
        .select({
          id: activities.id,
          sectionId: activities.sectionId,
          templateId: activities.templateId,
          name: activities.name,
          description: activities.description,
          sortOrder: activities.sortOrder,
          createdAt: activities.createdAt,
          updatedAt: activities.updatedAt,
          templateName: templates.name,
        })
        .from(activities)
        .leftJoin(templates, eq(activities.templateId, templates.id))
        .where(inArray(activities.sectionId, sectionIds))
        .orderBy(asc(activities.sortOrder), asc(activities.createdAt))
        .all()
    : []

  // Group activities by section
  const activitiesBySection = new Map<string, typeof courseActivities>()
  for (const activity of courseActivities) {
    const list = activitiesBySection.get(activity.sectionId) ?? []
    list.push(activity)
    activitiesBySection.set(activity.sectionId, list)
  }

  return {
    ...course,
    sections: sections.map(section => ({
      ...section,
      activities: activitiesBySection.get(section.id) ?? [],
    })),
  }
})
