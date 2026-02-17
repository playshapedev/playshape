import { eq, and } from 'drizzle-orm'
import { assetImages } from '~~/server/database/schema'
import { readAssetFile, extensionToMimeType } from '~~/server/utils/assetStorage'

/**
 * Serve an asset image file.
 * GET /api/assets/:id/images/:imageId/file
 */
export default defineEventHandler(async (event) => {
  const assetId = getRouterParam(event, 'id')
  const imageId = getRouterParam(event, 'imageId')

  if (!assetId || !imageId) {
    throw createError({ statusCode: 400, statusMessage: 'Asset ID and Image ID are required' })
  }

  const db = useDb()
  const image = db
    .select()
    .from(assetImages)
    .where(and(eq(assetImages.id, imageId), eq(assetImages.assetId, assetId)))
    .get()

  if (!image) {
    throw createError({ statusCode: 404, statusMessage: 'Image not found' })
  }

  const fileBuffer = readAssetFile(image.storagePath)
  if (!fileBuffer) {
    throw createError({ statusCode: 404, statusMessage: 'Image file not found on disk' })
  }

  // Determine MIME type
  const mimeType = image.mimeType
    || extensionToMimeType(image.storagePath.substring(image.storagePath.lastIndexOf('.')))

  // Set appropriate headers
  setHeader(event, 'Content-Type', mimeType)
  setHeader(event, 'Content-Length', fileBuffer.length)
  setHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')

  return fileBuffer
})
