import { eq } from 'drizzle-orm'
import { libraries, documents } from '~~/server/database/schema'

export default defineEventHandler((event) => {
  const libraryId = getRouterParam(event, 'id')
  if (!libraryId) {
    throw createError({ statusCode: 400, statusMessage: 'Library ID is required' })
  }

  const db = useDb()

  // Verify library exists
  const library = db.select().from(libraries).where(eq(libraries.id, libraryId)).get()
  if (!library) {
    throw createError({ statusCode: 404, statusMessage: 'Library not found' })
  }

  return db.select().from(documents).where(eq(documents.libraryId, libraryId)).all()
})
