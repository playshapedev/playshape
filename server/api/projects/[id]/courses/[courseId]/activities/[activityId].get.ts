import { eq, and } from 'drizzle-orm'
import { courses, courseSections, activities, templates, templateVersions } from '~~/server/database/schema'

export default defineEventHandler((event) => {
  const projectId = getRouterParam(event, 'id')
  const courseId = getRouterParam(event, 'courseId')
  const activityId = getRouterParam(event, 'activityId')
  if (!projectId || !courseId || !activityId) {
    throw createError({ statusCode: 400, statusMessage: 'Project ID, Course ID, and Activity ID are required' })
  }

  const db = useDb()

  // Verify course belongs to project
  const course = db.select().from(courses).where(eq(courses.id, courseId)).get()
  if (!course || course.projectId !== projectId) {
    throw createError({ statusCode: 404, statusMessage: 'Course not found' })
  }

  // Fetch activity
  const activity = db.select().from(activities).where(eq(activities.id, activityId)).get()
  if (!activity) {
    throw createError({ statusCode: 404, statusMessage: 'Activity not found' })
  }

  // Verify activity belongs to this course (via section)
  const section = db.select().from(courseSections).where(eq(courseSections.id, activity.sectionId)).get()
  if (!section || section.courseId !== courseId) {
    throw createError({ statusCode: 404, statusMessage: 'Activity not found in this course' })
  }

  // Fetch template info
  const tmpl = db.select().from(templates).where(eq(templates.id, activity.templateId)).get()
  if (!tmpl) {
    return {
      ...activity,
      template: null,
    }
  }

  // Determine which version of the template to use
  const activityDataVersion = activity.dataSchemaVersion ?? 1
  const latestTemplateVersion = tmpl.schemaVersion

  // If activity is on the latest version, use current template data
  if (activityDataVersion >= latestTemplateVersion) {
    return {
      ...activity,
      template: {
        id: tmpl.id,
        name: tmpl.name,
        description: tmpl.description,
        inputSchema: tmpl.inputSchema,
        component: tmpl.component,
        sampleData: tmpl.sampleData,
        dependencies: tmpl.dependencies,
        tools: tmpl.tools,
        status: tmpl.status,
        schemaVersion: latestTemplateVersion,
        upgradeAvailable: false,
      },
    }
  }

  // Activity is on an older version - fetch that version's snapshot
  const versionSnapshot = db
    .select()
    .from(templateVersions)
    .where(
      and(
        eq(templateVersions.templateId, tmpl.id),
        eq(templateVersions.version, activityDataVersion),
      ),
    )
    .get()

  if (versionSnapshot) {
    return {
      ...activity,
      template: {
        id: tmpl.id,
        name: tmpl.name,
        description: tmpl.description,
        inputSchema: versionSnapshot.inputSchema,
        component: versionSnapshot.component,
        sampleData: versionSnapshot.sampleData,
        dependencies: versionSnapshot.dependencies,
        tools: versionSnapshot.tools,
        status: tmpl.status,
        schemaVersion: activityDataVersion,
        latestSchemaVersion: latestTemplateVersion,
        upgradeAvailable: true,
      },
    }
  }

  // Fallback: version snapshot not found (shouldn't happen, but handle gracefully)
  // Use current template data but mark that upgrade is available
  return {
    ...activity,
    template: {
      id: tmpl.id,
      name: tmpl.name,
      description: tmpl.description,
      inputSchema: tmpl.inputSchema,
      component: tmpl.component,
      sampleData: tmpl.sampleData,
      dependencies: tmpl.dependencies,
      tools: tmpl.tools,
      status: tmpl.status,
      schemaVersion: latestTemplateVersion,
      upgradeAvailable: false,
    },
  }
})
