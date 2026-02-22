import { eq, and, gte } from 'drizzle-orm'
import { courses, courseSections, activities, templates, templateMigrations } from '~~/server/database/schema'
import { runMigration } from '~~/server/utils/runMigration'
import { validateDataAgainstSchema } from '~~/server/utils/buildZodFromInputSchema'
import type { TemplateField } from '~~/server/database/schema'

/**
 * POST /api/projects/:id/courses/:courseId/activities/:activityId/upgrade
 *
 * Upgrades an activity's data from its current schema version to the latest
 * template version by running all intermediate migrations sequentially.
 *
 * Response:
 * - 200: { success: true, fromVersion, toVersion, data }
 * - 400: No upgrade needed or migration failed
 * - 404: Activity/course/template not found
 */
export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'id')
  const courseId = getRouterParam(event, 'courseId')
  const activityId = getRouterParam(event, 'activityId')

  if (!projectId || !courseId || !activityId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Project ID, Course ID, and Activity ID are required',
    })
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

  // Fetch template
  const tmpl = db.select().from(templates).where(eq(templates.id, activity.templateId)).get()
  if (!tmpl) {
    throw createError({ statusCode: 404, statusMessage: 'Template not found' })
  }

  const currentVersion = activity.dataSchemaVersion ?? 1
  const targetVersion = tmpl.schemaVersion

  // Check if upgrade is needed
  if (currentVersion >= targetVersion) {
    throw createError({
      statusCode: 400,
      statusMessage: `Activity is already on version ${currentVersion} (latest: ${targetVersion})`,
    })
  }

  // Fetch all migrations from current version to target version
  const migrations = db
    .select()
    .from(templateMigrations)
    .where(
      and(
        eq(templateMigrations.templateId, tmpl.id),
        gte(templateMigrations.fromVersion, currentVersion),
      ),
    )
    .orderBy(templateMigrations.fromVersion)
    .all()

  // Build migration chain
  const migrationChain: Array<{ fromVersion: number, toVersion: number, migrationFn: string }> = []
  let nextVersion = currentVersion

  while (nextVersion < targetVersion) {
    const migration = migrations.find(m => m.fromVersion === nextVersion)
    if (!migration) {
      throw createError({
        statusCode: 400,
        statusMessage: `Missing migration from version ${nextVersion} to ${nextVersion + 1}. Cannot upgrade.`,
      })
    }
    migrationChain.push({
      fromVersion: migration.fromVersion,
      toVersion: migration.toVersion,
      migrationFn: migration.migrationFn,
    })
    nextVersion = migration.toVersion
  }

  // Run migrations sequentially
  let data = activity.data as Record<string, unknown> ?? {}

  for (const migration of migrationChain) {
    const result = await runMigration(migration.migrationFn, data)

    if (!result.success) {
      throw createError({
        statusCode: 400,
        statusMessage: `Migration from v${migration.fromVersion} to v${migration.toVersion} failed: ${result.error}`,
      })
    }

    data = result.data
  }

  // Validate final data against latest schema
  const validation = validateDataAgainstSchema(
    data,
    tmpl.inputSchema as TemplateField[],
  )

  if (!validation.success) {
    throw createError({
      statusCode: 400,
      statusMessage: `Migrated data doesn't match latest schema: ${validation.errors.join(', ')}`,
    })
  }

  // Update activity with migrated data
  db.update(activities)
    .set({
      data,
      dataSchemaVersion: targetVersion,
      updatedAt: new Date(),
    })
    .where(eq(activities.id, activityId))
    .run()

  return {
    success: true,
    fromVersion: currentVersion,
    toVersion: targetVersion,
    data,
  }
})
