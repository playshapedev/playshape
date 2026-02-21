/**
 * POST /api/assets/generate
 *
 * Quick image generation endpoint. Creates a new asset with a generated image.
 * Designed for use with the background task system.
 *
 * Returns the asset and image details on success.
 */

import { z } from 'zod'
import { assets, assetImages } from '~~/server/database/schema'
import {
  generateImage,
  useActiveImageModel,
  DEFAULT_ASPECT_RATIO,
  ASPECT_RATIOS,
} from '~~/server/utils/imageGeneration'
import {
  generateAssetImageFilename,
  saveAssetFile,
} from '~~/server/utils/assetStorage'

const bodySchema = z.object({
  prompt: z.string().min(1).max(2000),
  name: z.string().optional(),
  projectId: z.string().uuid().optional(),
  aspectRatio: z.enum(['1:1', '16:9', '9:16', '21:9', '4:3', '3:4']).optional(),
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

  const { prompt, name, projectId, aspectRatio } = parsed.data

  // Get active image model
  const imageModelConfig = useActiveImageModel()
  if (!imageModelConfig) {
    throw createError({
      statusCode: 400,
      statusMessage: 'No active image model configured. Please configure an image model in Settings.',
    })
  }

  // Generate the image
  const result = await generateImage(prompt, imageModelConfig, {
    aspectRatio: aspectRatio || DEFAULT_ASPECT_RATIO,
  })

  const db = useDb()
  const now = new Date()
  const assetId = crypto.randomUUID()
  const imageId = crypto.randomUUID()

  // Generate a default name from the prompt if not provided
  const assetName = name || prompt.slice(0, 50) + (prompt.length > 50 ? '...' : '')

  // Save the image file
  const filename = generateAssetImageFilename(imageId, result.mimeType)
  saveAssetFile(filename, result.buffer)

  // Create the asset
  db.insert(assets)
    .values({
      id: assetId,
      projectId: projectId || null,
      type: 'image',
      name: assetName,
      messages: [],
      createdAt: now,
      updatedAt: now,
    })
    .run()

  // Create the image record
  db.insert(assetImages)
    .values({
      id: imageId,
      assetId,
      prompt,
      storagePath: filename,
      mimeType: result.mimeType,
      width: result.width,
      height: result.height,
      fileSize: result.buffer.length,
      createdAt: now,
    })
    .run()

  return {
    id: assetId,
    imageId,
    type: 'image',
    name: assetName,
    projectId: projectId || null,
    image: {
      id: imageId,
      prompt,
      url: `/api/assets/${assetId}/images/${imageId}/file`,
      mimeType: result.mimeType,
      width: result.width,
      height: result.height,
      fileSize: result.buffer.length,
    },
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  }
})
