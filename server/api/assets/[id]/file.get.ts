import { eq } from 'drizzle-orm'
import { assets } from '~~/server/database/schema'
import { readAssetFile, extensionToMimeType } from '~~/server/utils/assetStorage'

/**
 * Serve an asset file.
 * GET /api/assets/:id/file
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

  if (!asset.storagePath) {
    throw createError({ statusCode: 404, statusMessage: 'Asset has no file' })
  }

  const fileBuffer = readAssetFile(asset.storagePath)
  if (!fileBuffer) {
    throw createError({ statusCode: 404, statusMessage: 'Asset file not found on disk' })
  }

  // Determine MIME type
  const mimeType = asset.mimeType
    || extensionToMimeType(asset.storagePath.substring(asset.storagePath.lastIndexOf('.')))

  // Set appropriate headers
  setHeader(event, 'Content-Type', mimeType)
  setHeader(event, 'Content-Length', fileBuffer.length)
  setHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')

  return fileBuffer
})
