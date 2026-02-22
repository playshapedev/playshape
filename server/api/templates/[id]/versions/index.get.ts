import { eq } from 'drizzle-orm'
import { templates, templateVersions } from '~~/server/database/schema'

/**
 * GET /api/templates/:id/versions
 *
 * Returns all versions for a template, sorted by version number descending.
 */
export default defineEventHandler(async (event) => {
  const templateId = getRouterParam(event, 'id')
  if (!templateId) {
    throw createError({ statusCode: 400, statusMessage: 'Template ID is required' })
  }

  const db = useDb()

  // Verify template exists
  const template = db.select().from(templates).where(eq(templates.id, templateId)).get()
  if (!template) {
    throw createError({ statusCode: 404, statusMessage: 'Template not found' })
  }

  // Fetch all versions
  const versions = db
    .select({
      id: templateVersions.id,
      version: templateVersions.version,
      createdAt: templateVersions.createdAt,
    })
    .from(templateVersions)
    .where(eq(templateVersions.templateId, templateId))
    .all()
    .sort((a, b) => b.version - a.version)

  return {
    templateId,
    currentVersion: template.schemaVersion,
    versions,
  }
})
