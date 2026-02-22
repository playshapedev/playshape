import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { documents } from '~~/server/database/schema'

const updateDocumentSchema = z.object({
  title: z.string().min(1).optional(),
  body: z.string().optional(),
  summary: z.string().optional().nullable(),
  messages: z.any().optional(),
})

export default defineEventHandler(async (event) => {
  const libraryId = getRouterParam(event, 'id')
  const docId = getRouterParam(event, 'docId')

  if (!libraryId || !docId) {
    throw createError({ statusCode: 400, statusMessage: 'Library ID and Document ID are required' })
  }

  const body = await readBody(event)
  const parsed = updateDocumentSchema.parse(body)

  const db = useDb()

  const existing = db
    .select()
    .from(documents)
    .where(and(eq(documents.id, docId), eq(documents.libraryId, libraryId)))
    .get()

  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Document not found' })
  }

  // If messages are being cleared, also reset the stale context timestamps
  const updatePayload: Record<string, unknown> = {
    ...parsed,
    updatedAt: new Date(),
  }

  if (Array.isArray(parsed.messages) && parsed.messages.length === 0) {
    updatePayload.contentLastReadAt = null
    updatePayload.contentLastModifiedAt = null
  }

  db.update(documents)
    .set(updatePayload)
    .where(eq(documents.id, docId))
    .run()

  return db
    .select()
    .from(documents)
    .where(eq(documents.id, docId))
    .get()
})
