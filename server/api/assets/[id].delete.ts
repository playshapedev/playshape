import { eq } from 'drizzle-orm'
import { assets } from '~~/server/database/schema'
import { deleteAssetFile } from '~~/server/utils/assetStorage'

/**
 * Delete an asset and its file.
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

  // Delete the file from disk
  if (asset.storagePath) {
    deleteAssetFile(asset.storagePath)
  }

  // Delete the database record
  db.delete(assets).where(eq(assets.id, id)).run()

  setResponseStatus(event, 204)
  return null
})
