/**
 * POST /api/assets/videos/url
 *
 * Create a new video asset from a YouTube or Vimeo URL.
 * Parses the URL to extract platform-specific metadata.
 */

import { z } from 'zod'
import { assets, assetVideos } from '~~/server/database/schema'
import { parseVideoUrl } from '~~/server/utils/videoUrl'

const bodySchema = z.object({
  url: z.string().url(),
  name: z.string().optional(),
  projectId: z.string().uuid().optional(),
})

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const parsed = bodySchema.safeParse(body)

  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid request body',
      data: parsed.error.flatten(),
    })
  }

  const { url, name, projectId } = parsed.data

  // Parse the video URL
  const videoInfo = parseVideoUrl(url)
  if (!videoInfo) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid video URL. Only YouTube and Vimeo URLs are supported.',
    })
  }

  const db = useDb()
  const now = new Date()
  const assetId = crypto.randomUUID()
  const videoId = crypto.randomUUID()

  // Generate a default name if not provided
  const assetName = name || `${videoInfo.source === 'youtube' ? 'YouTube' : 'Vimeo'} Video`

  // Create the asset
  db.insert(assets)
    .values({
      id: assetId,
      projectId: projectId || null,
      type: 'video',
      name: assetName,
      messages: [],
      createdAt: now,
      updatedAt: now,
    })
    .run()

  // Create the video record
  db.insert(assetVideos)
    .values({
      id: videoId,
      assetId,
      source: videoInfo.source,
      url: videoInfo.embedUrl,
      thumbnailPath: videoInfo.thumbnailUrl, // External URL for YouTube/Vimeo
      createdAt: now,
    })
    .run()

  return {
    id: assetId,
    videoId,
    type: 'video',
    name: assetName,
    projectId: projectId || null,
    video: {
      id: videoId,
      source: videoInfo.source,
      url: videoInfo.embedUrl,
      thumbnailUrl: videoInfo.thumbnailUrl,
      originalUrl: url,
    },
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  }
})
