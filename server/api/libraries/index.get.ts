import { eq, count } from 'drizzle-orm'
import { libraries, documents } from '~~/server/database/schema'

export default defineEventHandler(() => {
  const db = useDb()

  const rows = db
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
    .groupBy(libraries.id)
    .all()

  return rows
})
