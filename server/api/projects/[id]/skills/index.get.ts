import { eq, asc, inArray } from 'drizzle-orm'
import { projects, skills, objectives, activitySkills, activities, courseSections, courses } from '~~/server/database/schema'

export default defineEventHandler((event) => {
  const projectId = getRouterParam(event, 'id')
  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: 'Project ID is required' })
  }

  const db = useDb()

  const project = db.select().from(projects).where(eq(projects.id, projectId)).get()
  if (!project) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  }

  const skillRows = db
    .select()
    .from(skills)
    .where(eq(skills.projectId, projectId))
    .orderBy(asc(skills.sortOrder), asc(skills.createdAt))
    .all()

  if (!skillRows.length) return []

  const skillIds = skillRows.map(s => s.id)

  const objectiveRows = db
    .select()
    .from(objectives)
    .where(inArray(objectives.skillId, skillIds))
    .orderBy(asc(objectives.sortOrder), asc(objectives.createdAt))
    .all()

  // Activities linked to each skill, with enough course info to link to them
  const linkRows = db
    .select({
      skillId: activitySkills.skillId,
      id: activities.id,
      name: activities.name,
      courseId: courses.id,
      courseName: courses.name,
    })
    .from(activitySkills)
    .innerJoin(activities, eq(activitySkills.activityId, activities.id))
    .innerJoin(courseSections, eq(activities.sectionId, courseSections.id))
    .innerJoin(courses, eq(courseSections.courseId, courses.id))
    .where(inArray(activitySkills.skillId, skillIds))
    .orderBy(asc(courses.sortOrder), asc(courseSections.sortOrder), asc(activities.sortOrder))
    .all()

  return skillRows.map(skill => ({
    ...skill,
    objectives: objectiveRows.filter(o => o.skillId === skill.id),
    activities: linkRows
      .filter(l => l.skillId === skill.id)
      .map(({ skillId: _skillId, ...activity }) => activity),
  }))
})
