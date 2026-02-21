/**
 * POST /api/assets/:id/videos
 * 
 * Upload a video file to an asset. The video is compressed for web playback
 * and a thumbnail is extracted.
 */

import { eq } from 'drizzle-orm'
import { join } from 'node:path'
import { writeFileSync, unlinkSync } from 'node:fs'
import { assets, assetVideos } from '~~/server/database/schema'
import {
  ensureAssetsDir,
  getAssetsDir,
  generateAssetVideoFilename,
  generateVideoThumbnailFilename,
  saveAssetFile,
} from '~~/server/utils/assetStorage'
import { compressVideo, extractThumbnail, getVideoMetadata, isFFmpegAvailable } from '~~/server/utils/videoProcessing'

export default defineEventHandler(async (event) => {
  const assetId = getRouterParam(event, 'id')
  if (!assetId) {
    throw createError({ statusCode: 400, statusMessage: 'Asset ID is required' })
  }

  const db = useDb()

  // Verify asset exists and is a video type
  const asset = db.select().from(assets).where(eq(assets.id, assetId)).get()
  if (!asset) {
    throw createError({ statusCode: 404, statusMessage: 'Asset not found' })
  }

  if (asset.type !== 'video') {
    throw createError({ statusCode: 400, statusMessage: 'Asset is not a video type' })
  }

  // Check if ffmpeg is available
  const ffmpegAvailable = await isFFmpegAvailable()
  if (!ffmpegAvailable) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Video processing is not available. Please ensure ffmpeg is installed.',
    })
  }

  // Parse multipart form data
  const formData = await readMultipartFormData(event)
  if (!formData || formData.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No file uploaded' })
  }

  const fileField = formData.find(f => f.name === 'file')
  if (!fileField || !fileField.data) {
    throw createError({ statusCode: 400, statusMessage: 'No video file in request' })
  }

  const mimeType = fileField.type || 'video/mp4'
  const allowedTypes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska']
  if (!allowedTypes.includes(mimeType)) {
    throw createError({
      statusCode: 400,
      statusMessage: `Unsupported video format: ${mimeType}. Allowed: MP4, WebM, MOV, AVI, MKV`,
    })
  }

  ensureAssetsDir()
  const assetsDir = getAssetsDir()

  // Generate IDs and paths
  const videoId = crypto.randomUUID()
  const tempInputPath = join(assetsDir, `${videoId}_temp_input`)
  const outputFilename = generateAssetVideoFilename(videoId, 'video/mp4') // Always output MP4
  const outputPath = join(assetsDir, outputFilename)
  const thumbnailFilename = generateVideoThumbnailFilename(videoId)
  const thumbnailPath = join(assetsDir, thumbnailFilename)

  try {
    // Write the uploaded file to a temp location
    writeFileSync(tempInputPath, fileField.data)

    // Compress the video for web
    console.log(`[video] Compressing video ${videoId}...`)
    const metadata = await compressVideo(tempInputPath, outputPath, {
      maxWidth: 1920,
      maxHeight: 1080,
      crf: 23,
    })
    console.log(`[video] Compression complete: ${metadata.width}x${metadata.height}, ${metadata.duration}s`)

    // Extract thumbnail
    console.log(`[video] Extracting thumbnail...`)
    const thumbnailTimestamp = Math.min(1, metadata.duration / 2) // 1 second in, or middle if very short
    await extractThumbnail(outputPath, thumbnailPath, thumbnailTimestamp)
    console.log(`[video] Thumbnail extracted`)

    // Clean up temp file
    try {
      unlinkSync(tempInputPath)
    }
    catch {
      // Ignore cleanup errors
    }

    // Insert video record
    db.insert(assetVideos)
      .values({
        id: videoId,
        assetId,
        source: 'upload',
        storagePath: outputFilename,
        thumbnailPath: thumbnailFilename,
        mimeType: 'video/mp4',
        width: metadata.width,
        height: metadata.height,
        duration: Math.round(metadata.duration),
        fileSize: metadata.fileSize,
        createdAt: new Date(),
      })
      .run()

    // Update asset timestamp
    db.update(assets)
      .set({ updatedAt: new Date() })
      .where(eq(assets.id, assetId))
      .run()

    return {
      id: videoId,
      assetId,
      source: 'upload',
      width: metadata.width,
      height: metadata.height,
      duration: Math.round(metadata.duration),
      fileSize: metadata.fileSize,
      mimeType: 'video/mp4',
    }
  }
  catch (error) {
    // Clean up on error
    try {
      unlinkSync(tempInputPath)
    }
    catch { /* ignore */ }
    try {
      unlinkSync(outputPath)
    }
    catch { /* ignore */ }
    try {
      unlinkSync(thumbnailPath)
    }
    catch { /* ignore */ }

    console.error('[video] Processing failed:', error)
    throw createError({
      statusCode: 500,
      statusMessage: error instanceof Error ? error.message : 'Video processing failed',
    })
  }
})
