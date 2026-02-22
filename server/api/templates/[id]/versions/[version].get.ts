import { eq, and } from 'drizzle-orm'
import { templates, templateVersions } from '~~/server/database/schema'

/**
 * GET /api/templates/:id/versions/:version
 *
 * Returns a specific version snapshot of a template.
 * Used when rendering activities that are on an older version.
 */
export default defineEventHandler(async (event) => {
  const templateId = getRouterParam(event, 'id')
  const versionParam = getRouterParam(event, 'version')

  if (!templateId || !versionParam) {
    throw createError({ statusCode: 400, statusMessage: 'Template ID and version are required' })
  }

  const version = parseInt(versionParam, 10)
  if (isNaN(version) || version < 1) {
    throw createError({ statusCode: 400, statusMessage: 'Version must be a positive integer' })
  }

  const db = useDb()

  // Verify template exists
  const template = db.select().from(templates).where(eq(templates.id, templateId)).get()
  if (!template) {
    throw createError({ statusCode: 404, statusMessage: 'Template not found' })
  }

  // Fetch the specific version
  const versionSnapshot = db
    .select()
    .from(templateVersions)
    .where(
      and(
        eq(templateVersions.templateId, templateId),
        eq(templateVersions.version, version),
      ),
    )
    .get()

  if (!versionSnapshot) {
    throw createError({ statusCode: 404, statusMessage: `Version ${version} not found` })
  }

  return {
    id: versionSnapshot.id,
    templateId: versionSnapshot.templateId,
    version: versionSnapshot.version,
    inputSchema: versionSnapshot.inputSchema,
    component: versionSnapshot.component,
    sampleData: versionSnapshot.sampleData,
    dependencies: versionSnapshot.dependencies,
    tools: versionSnapshot.tools,
    createdAt: versionSnapshot.createdAt,
    // Include metadata about the template's current state
    isLatestVersion: version === template.schemaVersion,
    latestVersion: template.schemaVersion,
  }
})
