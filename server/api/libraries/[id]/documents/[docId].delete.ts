import { eq, and } from 'drizzle-orm'
import { join } from 'node:path'
import { existsSync, rmSync } from 'node:fs'
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

  // Delete from database — cascade removes chunks
  db.delete(documents).where(eq(documents.id, docId)).run()

  // Clean up file on disk
  const uploadsDir = getUploadsDir()
  const docDir = join(uploadsDir, libraryId, docId)
  if (existsSync(docDir)) {
    rmSync(docDir, { recursive: true, force: true })
  }

  setResponseStatus(event, 204)
  return null
})
