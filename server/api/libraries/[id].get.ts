import { eq, count } from 'drizzle-orm'
import { libraries, documents } from '~~/server/database/schema'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Library ID is required' })
  }

  const db = useDb()

  const library = db
    .select({
      id: libraries.id,
      name: libraries.name,
      description: libraries.description,
      createdAt: libraries.createdAt,
      updatedAt: libraries.updatedAt,
      documentCount: count(documents.id).as('document_count'),
    })
    .from(libraries)
    .leftJoin(documents, eq(documents.libraryId, libraries.id))
    .where(eq(libraries.id, id))
    .groupBy(libraries.id)
    .get()

  if (!library) {
    throw createError({ statusCode: 404, statusMessage: 'Library not found' })
  }

  return library
})
