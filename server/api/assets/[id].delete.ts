import { eq } from 'drizzle-orm'
import { assets, assetImages } from '~~/server/database/schema'
import { deleteAssetFile } from '~~/server/utils/assetStorage'

/**
 * Delete an asset and all its images.
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

  // Delete the database records (cascade will delete asset_images)
  db.delete(assets).where(eq(assets.id, id)).run()

  setResponseStatus(event, 204)
  return null
})
