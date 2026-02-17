import { eq, and } from 'drizzle-orm'
import { generateImage as aiGenerateImage } from 'ai'
import { createFireworks } from '@ai-sdk/fireworks'
import { createOpenAI } from '@ai-sdk/openai'
import Replicate from 'replicate'
import { fal } from '@fal-ai/client'
import { aiProviders, aiModels, type AIProviderType } from '../database/schema'

export interface ImageGenerationResult {
  buffer: Buffer
  mimeType: string
  width?: number
  height?: number
}

interface ImageModelConfig {
  providerType: AIProviderType
  modelId: string
  apiKey: string | null
  baseUrl?: string | null
}

/**
 * Get the active image model configuration.
 * Returns null if no active image model is configured.
 */
export function useActiveImageModel(): ImageModelConfig | null {
  const db = useDb()

  const activeModel = db
    .select()
    .from(aiModels)
    .where(and(eq(aiModels.purpose, 'image'), eq(aiModels.isActive, true)))
    .get()

  if (!activeModel) {
    return null
  }

  const provider = db
    .select()
    .from(aiProviders)
    .where(eq(aiProviders.id, activeModel.providerId))
    .get()

  if (!provider) {
    return null
  }

  return {
    providerType: provider.type,
    modelId: activeModel.modelId,
    apiKey: provider.apiKey,
    baseUrl: provider.baseUrl,
  }
}

/**
 * Get an image model configuration by model ID.
 * Used when user selects a specific model in the UI.
 */
export function getImageModelConfig(modelId: string): ImageModelConfig | null {
  const db = useDb()

  const model = db
    .select()
    .from(aiModels)
    .where(and(eq(aiModels.modelId, modelId), eq(aiModels.purpose, 'image')))
    .get()

  if (!model) {
    return null
  }

  const provider = db
    .select()
    .from(aiProviders)
    .where(eq(aiProviders.id, model.providerId))
    .get()

  if (!provider) {
    return null
  }

  return {
    providerType: provider.type,
    modelId: model.modelId,
    apiKey: provider.apiKey,
    baseUrl: provider.baseUrl,
  }
}

/**
 * Generate an image using the specified model configuration.
 */
export async function generateImage(
  prompt: string,
  config: ImageModelConfig,
): Promise<ImageGenerationResult> {
  switch (config.providerType) {
    case 'fireworks':
      return generateWithFireworks(prompt, config)
    case 'replicate':
      return generateWithReplicate(prompt, config)
    case 'fal':
      return generateWithFal(prompt, config)
    case 'openai':
      return generateWithOpenAI(prompt, config)
    default:
      throw createError({
        statusCode: 400,
        statusMessage: `Image generation not supported for provider: ${config.providerType}`,
      })
  }
}

// ─── Fireworks (FLUX) ────────────────────────────────────────────────────────
// Uses AI SDK's generateImage which handles the async workflow automatically

async function generateWithFireworks(
  prompt: string,
  config: ImageModelConfig,
): Promise<ImageGenerationResult> {
  if (!config.apiKey) {
    throw createError({ statusCode: 400, statusMessage: 'Fireworks API key is required' })
  }

  const fireworks = createFireworks({ apiKey: config.apiKey })
  const model = fireworks.image(config.modelId)

  const { images } = await aiGenerateImage({
    model,
    prompt,
    n: 1,
  })

  if (!images.length || !images[0]) {
    throw createError({
      statusCode: 500,
      statusMessage: 'No image generated',
    })
  }

  const image = images[0]
  const buffer = Buffer.from(image.uint8Array)
  const dimensions = getImageDimensions(buffer)

  return {
    buffer,
    mimeType: image.mediaType || 'image/png',
    ...dimensions,
  }
}

// ─── Replicate ───────────────────────────────────────────────────────────────

async function generateWithReplicate(
  prompt: string,
  config: ImageModelConfig,
): Promise<ImageGenerationResult> {
  if (!config.apiKey) {
    throw createError({ statusCode: 400, statusMessage: 'Replicate API key is required' })
  }

  const replicate = new Replicate({ auth: config.apiKey })

  // Run the model - Replicate uses owner/model format
  const output = await replicate.run(config.modelId as `${string}/${string}`, {
    input: { prompt },
  })

  // Output can be a URL string, array of URLs, or object with URL
  let imageUrl: string | undefined

  if (typeof output === 'string') {
    imageUrl = output
  }
  else if (Array.isArray(output) && output.length > 0) {
    imageUrl = typeof output[0] === 'string' ? output[0] : (output[0] as { url?: string })?.url
  }
  else if (output && typeof output === 'object' && 'url' in output) {
    imageUrl = (output as { url: string }).url
  }

  if (!imageUrl) {
    throw createError({
      statusCode: 500,
      statusMessage: 'No image URL in Replicate response',
    })
  }

  return downloadImage(imageUrl)
}

// ─── fal.ai ──────────────────────────────────────────────────────────────────

async function generateWithFal(
  prompt: string,
  config: ImageModelConfig,
): Promise<ImageGenerationResult> {
  if (!config.apiKey) {
    throw createError({ statusCode: 400, statusMessage: 'fal.ai API key is required' })
  }

  // Configure fal client
  fal.config({ credentials: config.apiKey })

  // Run the model
  const result = await fal.subscribe(config.modelId, {
    input: { prompt },
  }) as {
    data: {
      images?: Array<{ url: string; width?: number; height?: number }>
    }
  }

  const imageData = result.data?.images?.[0]
  if (!imageData?.url) {
    throw createError({
      statusCode: 500,
      statusMessage: 'No image URL in fal.ai response',
    })
  }

  const downloaded = await downloadImage(imageData.url)
  return {
    ...downloaded,
    width: imageData.width ?? downloaded.width,
    height: imageData.height ?? downloaded.height,
  }
}

// ─── OpenAI (DALL-E) ─────────────────────────────────────────────────────────
// Uses AI SDK's generateImage for consistent interface

async function generateWithOpenAI(
  prompt: string,
  config: ImageModelConfig,
): Promise<ImageGenerationResult> {
  if (!config.apiKey) {
    throw createError({ statusCode: 400, statusMessage: 'OpenAI API key is required' })
  }

  const openai = createOpenAI({ apiKey: config.apiKey })
  const model = openai.image(config.modelId)

  const { images } = await aiGenerateImage({
    model,
    prompt,
    n: 1,
  })

  if (!images.length || !images[0]) {
    throw createError({
      statusCode: 500,
      statusMessage: 'No image generated',
    })
  }

  const image = images[0]
  const buffer = Buffer.from(image.uint8Array)
  const dimensions = getImageDimensions(buffer)

  return {
    buffer,
    mimeType: image.mediaType || 'image/png',
    ...dimensions,
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function downloadImage(url: string): Promise<ImageGenerationResult> {
  const response = await fetch(url)
  if (!response.ok) {
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to download generated image: ${response.statusText}`,
    })
  }

  const contentType = response.headers.get('content-type') || 'image/png'
  const arrayBuffer = await response.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  // Try to extract dimensions from common image formats
  const dimensions = getImageDimensions(buffer)

  return {
    buffer,
    mimeType: contentType,
    ...dimensions,
  }
}

/**
 * Extract image dimensions from buffer (supports PNG and JPEG).
 */
function getImageDimensions(buffer: Buffer): { width?: number; height?: number } {
  // PNG: width at bytes 16-19, height at bytes 20-23 (big-endian)
  if (buffer.length > 24 && buffer[0] === 0x89 && buffer[1] === 0x50) {
    const width = buffer.readUInt32BE(16)
    const height = buffer.readUInt32BE(20)
    return { width, height }
  }

  // JPEG: more complex, scan for SOF marker
  if (buffer.length > 2 && buffer[0] === 0xFF && buffer[1] === 0xD8) {
    let offset = 2
    while (offset < buffer.length - 8) {
      if (buffer[offset] !== 0xFF) {
        offset++
        continue
      }
      const marker = buffer[offset + 1]!
      // SOF0, SOF1, SOF2 markers contain dimensions
      if (marker >= 0xC0 && marker <= 0xC3) {
        const height = buffer.readUInt16BE(offset + 5)
        const width = buffer.readUInt16BE(offset + 7)
        return { width, height }
      }
      // Skip to next marker
      const length = buffer.readUInt16BE(offset + 2)
      offset += 2 + length
    }
  }

  return {}
}
