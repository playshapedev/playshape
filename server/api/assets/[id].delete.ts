import { eq } from 'drizzle-orm'
import { assets, assetImages, chatAttachments } from '~~/server/database/schema'
import { deleteAssetFile } from '~~/server/utils/assetStorage'
import { deleteAttachmentFile } from '~~/server/utils/attachmentStorage'

/**
 * Delete an asset and all its images and attachments.
 * DELETE /api/assets/:id
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Asset ID is required' })
  }

  const db = useDb()
  const asset = db.select().from(assets).where(eq(assets.id, id)).get()

  if (!asset) {
    throw createError({ statusCode: 404, statusMessage: 'Asset not found' })
  }

  // Get all images for this asset and delete their files
  const images = db.select().from(assetImages).where(eq(assetImages.assetId, id)).all()
  for (const image of images) {
    deleteAssetFile(image.storagePath)
  }

  // Get all chat attachments for this asset and delete their files
  const attachments = db.select().from(chatAttachments).where(eq(chatAttachments.assetId, id)).all()
  for (const attachment of attachments) {
    deleteAttachmentFile(attachment.storagePath)
  }

  // Delete the database records (cascade will delete asset_images and chat_attachments)
  db.delete(assets).where(eq(assets.id, id)).run()

  setResponseStatus(event, 204)
  return null
})
