/**
 * GET /api/assets/:id/videos/:videoId/file
 * 
 * Serve a video file with support for range requests (seeking).
 */

import { eq, and } from 'drizzle-orm'
import { createReadStream, statSync } from 'node:fs'
import { assetVideos } from '~~/server/database/schema'
import { getAssetFilePath } from '~~/server/utils/assetStorage'

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

  if (!video.storagePath) {
    throw createError({ statusCode: 404, statusMessage: 'Video file not found (external URL only)' })
  }

  const filePath = getAssetFilePath(video.storagePath)

  // Get file stats
  let stat
  try {
    stat = statSync(filePath)
  }
  catch {
    throw createError({ statusCode: 404, statusMessage: 'Video file not found on disk' })
  }

  const fileSize = stat.size
  const mimeType = video.mimeType || 'video/mp4'

  // Handle range requests for video seeking
  const rangeHeader = getHeader(event, 'range')

  if (rangeHeader) {
    const parts = rangeHeader.replace(/bytes=/, '').split('-')
    const start = parseInt(parts[0] || '0', 10)
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
    const chunkSize = end - start + 1

    setResponseStatus(event, 206)
    setHeader(event, 'Content-Range', `bytes ${start}-${end}/${fileSize}`)
    setHeader(event, 'Accept-Ranges', 'bytes')
    setHeader(event, 'Content-Length', chunkSize)
    setHeader(event, 'Content-Type', mimeType)

    return sendStream(event, createReadStream(filePath, { start, end }))
  }

  // Full file request
  setHeader(event, 'Content-Length', fileSize)
  setHeader(event, 'Content-Type', mimeType)
  setHeader(event, 'Accept-Ranges', 'bytes')

  return sendStream(event, createReadStream(filePath))
})
