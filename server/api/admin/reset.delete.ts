import {
  activities,
  assetImages,
  assetVideos,
  assets,
  chatAttachments,
  courseSections,
  courses,
  documentChunks,
  documents,
  libraries,
  projectLibraries,
  projects,
  skills,
  templateMigrations,
  templatePendingChanges,
  templateVersions,
  templates,
  tokenUsage,
} from '~~/server/database/schema'

/**
 * DELETE /api/admin/reset
 *
 * Deletes all content data from the database while preserving settings.
 * Only available in development mode. This is a destructive operation with no undo.
 *
 * Preserved: AI providers, AI models, API keys, brands, app settings
 * Deleted: Projects, templates, libraries, documents, assets, activities, token usage
 */
export default defineEventHandler(async () => {
  // Only allow in development mode
  if (!import.meta.dev) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Not Found',
    })
  }

  const db = useDb()

  // Delete in order that respects foreign key constraints
  // (children before parents, junction tables first)

  // Activities and related
  db.delete(activities).run()

  // Course structure
  db.delete(courseSections).run()
  db.delete(courses).run()

  // Skills
  db.delete(skills).run()

  // Template related
  db.delete(templateMigrations).run()
  db.delete(templatePendingChanges).run()
  db.delete(templateVersions).run()
  db.delete(chatAttachments).run()
  db.delete(templates).run()

  // Assets
  db.delete(assetImages).run()
  db.delete(assetVideos).run()
  db.delete(assets).run()

  // Documents and libraries
  db.delete(documentChunks).run()
  db.delete(documents).run()
  db.delete(projectLibraries).run()
  db.delete(libraries).run()

  // Projects
  db.delete(projects).run()

  // Token usage (content-related tracking)
  db.delete(tokenUsage).run()

  // Preserved: aiProviders, aiModels, brands, settings

  return {
    success: true,
    message: 'All content data has been deleted. Settings and AI providers preserved.',
  }
})
