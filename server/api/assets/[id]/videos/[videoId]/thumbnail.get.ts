/**
 * GET /api/assets/:id/videos/:videoId/thumbnail
 * 
 * Serve a video thumbnail image.
 */

import { eq, and } from 'drizzle-orm'
import { assetVideos } from '~~/server/database/schema'
import { readAssetFile } from '~~/server/utils/assetStorage'

export default defineEventHandler(async (event) => {
  const assetId = getRouterParam(event, 'id')
  const videoId = getRouterParam(event, 'videoId')

  if (!assetId || !videoId) {
    throw createError({ statusCode: 400, statusMessage: 'Asset ID and Video ID are required' })
  }

  const db = useDb()

  // Get the video record
  const video = db
    .select()
    .from(assetVideos)
    .where(and(eq(assetVideos.id, videoId), eq(assetVideos.assetId, assetId)))
    .get()

  if (!video) {
    throw createError({ statusCode: 404, statusMessage: 'Video not found' })
  }

  if (!video.thumbnailPath) {
    throw createError({ statusCode: 404, statusMessage: 'Thumbnail not available' })
  }

  const buffer = readAssetFile(video.thumbnailPath)
  if (!buffer) {
    throw createError({ statusCode: 404, statusMessage: 'Thumbnail file not found on disk' })
  }

  setHeader(event, 'Content-Type', 'image/jpeg')
  setHeader(event, 'Content-Length', buffer.length)
  setHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')

  return buffer
})
