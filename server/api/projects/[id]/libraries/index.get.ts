import { eq, count } from 'drizzle-orm'
import { projects, libraries, projectLibraries, documents } from '~~/server/database/schema'

export default defineEventHandler((event) => {
  const projectId = getRouterParam(event, 'id')
  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: 'Project ID is required' })
  }

  const db = useDb()

  // Verify project exists
  const project = db.select().from(projects).where(eq(projects.id, projectId)).get()
  if (!project) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  }

  // Get linked libraries with document counts
  const rows = db
    .select({
      id: libraries.id,
      name: libraries.name,
      description: libraries.description,
      createdAt: libraries.createdAt,
      updatedAt: libraries.updatedAt,
      linkedAt: projectLibraries.linkedAt,
      documentCount: count(documents.id).as('document_count'),
    })
    .from(projectLibraries)
    .innerJoin(libraries, eq(projectLibraries.libraryId, libraries.id))
    .leftJoin(documents, eq(documents.libraryId, libraries.id))
    .where(eq(projectLibraries.projectId, projectId))
    .groupBy(libraries.id)
    .all()

  return rows
})
