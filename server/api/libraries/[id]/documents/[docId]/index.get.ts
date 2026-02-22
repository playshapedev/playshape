import { eq, and } from 'drizzle-orm'
import { documents } from '~~/server/database/schema'

export default defineEventHandler((event) => {
  const libraryId = getRouterParam(event, 'id')
  const docId = getRouterParam(event, 'docId')

  if (!libraryId || !docId) {
    throw createError({ statusCode: 400, statusMessage: 'Library ID and Document ID are required' })
  }

  const db = useDb()

  const document = db
    .select()
    .from(documents)
    .where(and(eq(documents.id, docId), eq(documents.libraryId, libraryId)))
    .get()

  if (!document) {
    throw createError({ statusCode: 404, statusMessage: 'Document not found' })
  }

  return document
})
