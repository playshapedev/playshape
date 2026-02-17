import { eq, desc } from 'drizzle-orm'
import { assets, assetImages } from '~~/server/database/schema'

/**
 * Get a single asset by ID with its images.
 * GET /api/assets/:id
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

  // Get all images for this asset
  const images = db
    .select()
    .from(assetImages)
    .where(eq(assetImages.assetId, id))
    .orderBy(desc(assetImages.createdAt))
    .all()

  return {
    ...asset,
    images,
    imageCount: images.length,
  }
})
