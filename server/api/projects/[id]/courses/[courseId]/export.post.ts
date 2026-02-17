/**
 * SCORM Export API Endpoint
 *
 * POST /api/projects/:id/courses/:courseId/export
 *
 * Exports a course as a SCORM 1.2 or SCORM 2004 ZIP package.
 *
 * Request body:
 * - format: 'scorm-1.2' | 'scorm-2004'
 * - offline?: boolean (bundle vendor scripts for offline use)
 *
 * Response: ZIP file as binary download
 */

import { eq, asc, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { courses, courseSections, activities, templates, brands } from '~~/server/database/schema'
import { packageScorm, getPackageFilename, type CourseExportData } from '~~/server/utils/scorm/packageScorm'
import type { ScormVersion } from '~~/server/utils/scorm/courseApiScorm'
import type { BrandData } from '~~/server/utils/scorm/buildCourseHtml'

const exportBodySchema = z.object({
  format: z.enum(['scorm-1.2', 'scorm-2004']),
  offline: z.boolean().optional().default(false),
})

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'id')
  const courseId = getRouterParam(event, 'courseId')

  if (!projectId || !courseId) {
    throw createError({ statusCode: 400, statusMessage: 'Project ID and Course ID are required' })
  }

  // Parse and validate request body
  const body = await readBody(event)
  const parseResult = exportBodySchema.safeParse(body)

  if (!parseResult.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid request body',
      data: parseResult.error.flatten(),
    })
  }

  const { format, offline } = parseResult.data
  const scormVersion: ScormVersion = format

  const db = useDb()

  // ─── Fetch Course ───────────────────────────────────────────────────────────

  const course = db
    .select({
      id: courses.id,
      projectId: courses.projectId,
      name: courses.name,
      description: courses.description,
      templateId: courses.templateId,
    })
    .from(courses)
    .where(eq(courses.id, courseId))
    .get()

  if (!course || course.projectId !== projectId) {
    throw createError({ statusCode: 404, statusMessage: 'Course not found' })
  }

  // ─── Fetch Sections ─────────────────────────────────────────────────────────

  const sections = db
    .select()
    .from(courseSections)
    .where(eq(courseSections.courseId, courseId))
    .orderBy(asc(courseSections.sortOrder), asc(courseSections.createdAt))
    .all()

  if (sections.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Course has no sections' })
  }

  // ─── Fetch Activities with Templates ────────────────────────────────────────

  const sectionIds = sections.map(s => s.id)

  const courseActivities = db
    .select({
      id: activities.id,
      sectionId: activities.sectionId,
      templateId: activities.templateId,
      name: activities.name,
      description: activities.description,
      data: activities.data,
      sortOrder: activities.sortOrder,
      // Template fields
      templateName: templates.name,
      templateComponent: templates.component,
      templateInputSchema: templates.inputSchema,
      templateDependencies: templates.dependencies,
    })
    .from(activities)
    .innerJoin(templates, eq(activities.templateId, templates.id))
    .where(inArray(activities.sectionId, sectionIds))
    .orderBy(asc(activities.sortOrder), asc(activities.createdAt))
    .all()

  if (courseActivities.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Course has no activities' })
  }

  // ─── Fetch Interface Template (if assigned) ─────────────────────────────────

  let interfaceTemplate: {
    id: string
    name: string
    component: string
    inputSchema: unknown[]
    dependencies: Array<{ name: string; url: string; global: string }> | null
  } | null = null

  if (course.templateId) {
    const template = db
      .select({
        id: templates.id,
        name: templates.name,
        component: templates.component,
        inputSchema: templates.inputSchema,
        dependencies: templates.dependencies,
      })
      .from(templates)
      .where(eq(templates.id, course.templateId))
      .get()

    if (template && template.component) {
      interfaceTemplate = {
        id: template.id,
        name: template.name,
        component: template.component,
        inputSchema: template.inputSchema || [],
        dependencies: template.dependencies || null,
      }
    }
  }

  // ─── Fetch Default Brand ────────────────────────────────────────────────────

  let brand: BrandData | null = null

  const defaultBrand = db
    .select()
    .from(brands)
    .where(eq(brands.isDefault, true))
    .get()

  if (defaultBrand) {
    brand = {
      primaryColor: defaultBrand.primaryColor,
      neutralColor: defaultBrand.neutralColor,
      accentColor: defaultBrand.accentColor,
      fontFamily: defaultBrand.fontFamily,
      fontSource: defaultBrand.fontSource as 'google' | 'system',
      baseFontSize: defaultBrand.baseFontSize,
      typeScaleRatio: defaultBrand.typeScaleRatio,
      borderRadius: defaultBrand.borderRadius,
    }
  }

  // ─── Build Export Data Structure ────────────────────────────────────────────

  // Group activities by section
  const activitiesBySection = new Map<string, typeof courseActivities>()
  for (const activity of courseActivities) {
    const list = activitiesBySection.get(activity.sectionId) ?? []
    list.push(activity)
    activitiesBySection.set(activity.sectionId, list)
  }

  const exportData: CourseExportData = {
    course: {
      id: course.id,
      name: course.name,
      description: course.description,
      templateId: course.templateId,
    },
    sections: sections.map(section => ({
      id: section.id,
      title: section.title,
      activities: (activitiesBySection.get(section.id) ?? []).map(activity => ({
        id: activity.id,
        name: activity.name,
        description: activity.description,
        data: activity.data || {},
        template: {
          id: activity.templateId,
          name: activity.templateName,
          component: activity.templateComponent || '',
          inputSchema: activity.templateInputSchema || [],
          dependencies: activity.templateDependencies || null,
        },
      })),
    })),
    interfaceTemplate,
    brand,
  }

  // ─── Package the SCORM ZIP ──────────────────────────────────────────────────

  const zipBuffer = await packageScorm(exportData, {
    scormVersion,
    offline,
  })

  // ─── Return as Download ─────────────────────────────────────────────────────

  const filename = getPackageFilename(course.name, scormVersion)

  setHeaders(event, {
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Content-Length': zipBuffer.length.toString(),
  })

  return zipBuffer
})
