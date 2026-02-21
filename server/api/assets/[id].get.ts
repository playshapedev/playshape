import { eq, desc } from 'drizzle-orm'
import { assets, assetImages, assetVideos } from '~~/server/database/schema'

/**
 * Get a single asset by ID with its images and videos.
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

  // Get all videos for this asset
  const videos = db
    .select()
    .from(assetVideos)
    .where(eq(assetVideos.assetId, id))
    .orderBy(desc(assetVideos.createdAt))
    .all()

  return {
    ...asset,
    images,
    imageCount: images.length,
    videos,
    videoCount: videos.length,
  }
})
