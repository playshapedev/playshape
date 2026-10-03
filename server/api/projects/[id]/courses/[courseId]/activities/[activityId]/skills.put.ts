import { z } from 'zod'
import { eq, and, inArray } from 'drizzle-orm'
import { courses, courseSections, activities, activitySkills, skills } from '~~/server/database/schema'

const setActivitySkillsSchema = z.object({
  skillIds: z.array(z.string().min(1)),
})

/**
 * PUT /api/projects/:id/courses/:courseId/activities/:activityId/skills
 *
 * Replaces the set of skills linked to an activity. Skills must belong to the
 * same project as the activity.
 */
export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'id')
  const courseId = getRouterParam(event, 'courseId')
  const activityId = getRouterParam(event, 'activityId')
  if (!projectId || !courseId || !activityId) {
    throw createError({ statusCode: 400, statusMessage: 'Project ID, Course ID, and Activity ID are required' })
  }

  const body = await readBody(event)
  const skillIds = [...new Set(setActivitySkillsSchema.parse(body).skillIds)]

  const db = useDb()

  // Verify course belongs to project
  const course = db.select().from(courses).where(eq(courses.id, courseId)).get()
  if (!course || course.projectId !== projectId) {
    throw createError({ statusCode: 404, statusMessage: 'Course not found' })
  }

  // Fetch and verify activity
  const activity = db.select().from(activities).where(eq(activities.id, activityId)).get()
  if (!activity) {
    throw createError({ statusCode: 404, statusMessage: 'Activity not found' })
  }

  const section = db.select().from(courseSections).where(eq(courseSections.id, activity.sectionId)).get()
  if (!section || section.courseId !== courseId) {
    throw createError({ statusCode: 404, statusMessage: 'Activity not found in this course' })
  }

  // Every skill must belong to this project
  if (skillIds.length) {
    const found = db
      .select({ id: skills.id })
      .from(skills)
      .where(and(inArray(skills.id, skillIds), eq(skills.projectId, projectId)))
      .all()
    if (found.length !== skillIds.length) {
      throw createError({ statusCode: 400, statusMessage: 'One or more skills do not belong to this project' })
    }
  }

  const now = new Date()
  db.transaction((tx) => {
    tx.delete(activitySkills).where(eq(activitySkills.activityId, activityId)).run()
    if (skillIds.length) {
      tx.insert(activitySkills)
        .values(skillIds.map(skillId => ({ activityId, skillId, linkedAt: now })))
        .run()
    }
  })

  return { activityId, skillIds }
})
