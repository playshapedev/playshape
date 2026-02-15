import { eq, and } from 'drizzle-orm'
import { projectLibraries } from '~~/server/database/schema'

export default defineEventHandler((event) => {
  const projectId = getRouterParam(event, 'id')
  const libId = getRouterParam(event, 'libId')

  if (!projectId || !libId) {
    throw createError({ statusCode: 400, statusMessage: 'Project ID and Library ID are required' })
  }

  const db = useDb()

  db.delete(projectLibraries)
    .where(and(
      eq(projectLibraries.projectId, projectId),
      eq(projectLibraries.libraryId, libId),
    ))
    .run()

  setResponseStatus(event, 204)
  return null
})
