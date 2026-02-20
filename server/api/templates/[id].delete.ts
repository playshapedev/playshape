import { eq } from 'drizzle-orm'
import { templates, chatAttachments } from '~~/server/database/schema'
import { deleteAttachmentFile } from '~~/server/utils/attachmentStorage'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Template ID is required' })
  }

  const db = useDb()

  const existing = db.select().from(templates).where(eq(templates.id, id)).get()
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Template not found' })
  }

  // Get all chat attachments for this template and delete their files
  const attachments = db.select().from(chatAttachments).where(eq(chatAttachments.templateId, id)).all()
  for (const attachment of attachments) {
    deleteAttachmentFile(attachment.storagePath)
  }

  // Delete the database records (cascade will delete chat_attachments)
  db.delete(templates).where(eq(templates.id, id)).run()

  return { ok: true }
})
