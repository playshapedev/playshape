import { desc, eq } from 'drizzle-orm'
import { assets, assetImages, assetVideos } from '~~/server/database/schema'

/**
 * List all assets with their images and videos, optionally filtered by project or type.
 * GET /api/assets?projectId=xxx&type=image|video
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const projectId = query.projectId as string | undefined
  const assetType = query.type as 'image' | 'video' | undefined

  const db = useDb()

  // Build query with filters
  let assetQuery = db.select().from(assets).orderBy(desc(assets.updatedAt))

  // Get all assets first, then filter in JS (simpler than building dynamic where clauses)
  const allAssets = assetQuery.all()

  const assetList = allAssets.filter((a) => {
    if (projectId && a.projectId !== projectId) return false
    if (assetType && a.type !== assetType) return false
    return true
  })

  if (assetList.length === 0) return []

  // Get all images
  const allImages = db
    .select()
    .from(assetImages)
    .orderBy(desc(assetImages.createdAt))
    .all()

  // Get all videos
  const allVideos = db
    .select()
    .from(assetVideos)
    .orderBy(desc(assetVideos.createdAt))
    .all()

  // Group images by asset
  const imagesByAsset = new Map<string, typeof allImages>()
  for (const img of allImages) {
    const list = imagesByAsset.get(img.assetId) || []
    list.push(img)
    imagesByAsset.set(img.assetId, list)
  }

  // Group videos by asset
  const videosByAsset = new Map<string, typeof allVideos>()
  for (const vid of allVideos) {
    const list = videosByAsset.get(vid.assetId) || []
    list.push(vid)
    videosByAsset.set(vid.assetId, list)
  }

  // Combine assets with their media
  return assetList.map(asset => ({
    ...asset,
    images: imagesByAsset.get(asset.id) || [],
    imageCount: (imagesByAsset.get(asset.id) || []).length,
    videos: videosByAsset.get(asset.id) || [],
    videoCount: (videosByAsset.get(asset.id) || []).length,
  }))
})
