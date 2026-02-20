import { eq } from 'drizzle-orm'
import { chatAttachments } from '~~/server/database/schema'
import { readAttachmentFile } from '~~/server/utils/attachmentStorage'

/**
 * Serve an attachment file by ID.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Attachment ID is required' })
  }

  const db = useDb()
  const attachment = db
    .select()
    .from(chatAttachments)
    .where(eq(chatAttachments.id, id))
    .get()

  if (!attachment) {
    throw createError({ statusCode: 404, statusMessage: 'Attachment not found' })
  }

  const buffer = readAttachmentFile(attachment.storagePath)
  if (!buffer) {
    throw createError({ statusCode: 404, statusMessage: 'Attachment file not found' })
  }

  setHeader(event, 'Content-Type', attachment.mimeType)
  setHeader(event, 'Content-Length', buffer.length)
  setHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')

  return buffer
})
