import { desc, eq } from 'drizzle-orm'
import { assets, assetImages } from '~~/server/database/schema'

/**
 * List all assets with their images, optionally filtered by project.
 * GET /api/assets?projectId=xxx
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const projectId = query.projectId as string | undefined

  const db = useDb()

  // Get assets
  const assetList = projectId
    ? db
        .select()
        .from(assets)
        .where(eq(assets.projectId, projectId))
        .orderBy(desc(assets.updatedAt))
        .all()
    : db
        .select()
        .from(assets)
        .orderBy(desc(assets.updatedAt))
        .all()

  // Get all images for these assets
  const assetIds = assetList.map(a => a.id)
  if (assetIds.length === 0) return []

  const allImages = db
    .select()
    .from(assetImages)
    .orderBy(desc(assetImages.createdAt))
    .all()

  // Group images by asset
  const imagesByAsset = new Map<string, typeof allImages>()
  for (const img of allImages) {
    const list = imagesByAsset.get(img.assetId) || []
    list.push(img)
    imagesByAsset.set(img.assetId, list)
  }

  // Combine assets with their images
  return assetList.map(asset => ({
    ...asset,
    images: imagesByAsset.get(asset.id) || [],
    imageCount: (imagesByAsset.get(asset.id) || []).length,
  }))
})
