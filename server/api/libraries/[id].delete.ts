import { eq } from 'drizzle-orm'
import { join } from 'node:path'
import { existsSync, rmSync } from 'node:fs'
import { libraries } from '~~/server/database/schema'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Library ID is required' })
  }

  const db = useDb()

  const existing = db.select().from(libraries).where(eq(libraries.id, id)).get()
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Library not found' })
  }

  // Delete library — cascade will remove documents, chunks, and project links
  db.delete(libraries).where(eq(libraries.id, id)).run()

  // Also clean up uploaded files on disk
  const uploadsDir = getUploadsDir()
  const libraryDir = join(uploadsDir, id)
  if (existsSync(libraryDir)) {
    rmSync(libraryDir, { recursive: true, force: true })
  }

  setResponseStatus(event, 204)
  return null
})
