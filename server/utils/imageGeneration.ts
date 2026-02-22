import { eq, and } from 'drizzle-orm'
import { generateImage as aiGenerateImage } from 'ai'
import { createFireworks } from '@ai-sdk/fireworks'
import { createOpenAI } from '@ai-sdk/openai'
import OpenAI, { toFile } from 'openai'
import Replicate from 'replicate'
import { fal } from '@fal-ai/client'
import { aiProviders, aiModels, type AIProviderType } from '../database/schema'

export interface ImageGenerationResult {
  buffer: Buffer
  mimeType: string
  width?: number
  height?: number
}

export interface ReferenceImage {
  buffer: Buffer
  mimeType: string
}

export interface ImageGenerationOptions {
  aspectRatio?: string
  /** Optional reference image for image-to-image generation */
  referenceImage?: ReferenceImage
}

interface ImageModelConfig {
  providerType: AIProviderType
  modelId: string
  apiKey: string | null
  baseUrl?: string | null
}

/** Supported aspect ratios with user-friendly labels */
export const ASPECT_RATIOS = [
  { value: '1:1', label: 'Square', description: '1:1' },
  { value: '16:9', label: 'Landscape', description: '16:9' },
  { value: '9:16', label: 'Portrait', description: '9:16' },
  { value: '21:9', label: 'Wide', description: '21:9' },
  { value: '4:3', label: 'Classic', description: '4:3' },
  { value: '3:4', label: 'Photo Portrait', description: '3:4' },
] as const

export const DEFAULT_ASPECT_RATIO = '1:1'

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
 * Optionally accepts a reference image for image-to-image generation.
 */
export async function generateImage(
  prompt: string,
  config: ImageModelConfig,
  options: ImageGenerationOptions = {},
): Promise<ImageGenerationResult> {
  const aspectRatio = options.aspectRatio || DEFAULT_ASPECT_RATIO
  const referenceImage = options.referenceImage

  switch (config.providerType) {
    case 'fireworks':
      return generateWithFireworks(prompt, config, aspectRatio, referenceImage)
    case 'replicate':
      return generateWithReplicate(prompt, config, aspectRatio, referenceImage)
    case 'fal':
      return generateWithFal(prompt, config, aspectRatio, referenceImage)
    case 'openai':
      return generateWithOpenAI(prompt, config, aspectRatio, referenceImage)
    case 'together':
      return generateWithTogether(prompt, config, aspectRatio, referenceImage)
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
  aspectRatio: string,
  referenceImage?: ReferenceImage,
): Promise<ImageGenerationResult> {
  if (!config.apiKey) {
    throw createError({ statusCode: 400, statusMessage: 'Fireworks API key is required' })
  }

  // Check if this is a FLUX Kontext model that supports image input
  const isKontextModel = config.modelId.includes('kontext')

  // If reference image provided but model doesn't support it, warn and proceed
  if (referenceImage && !isKontextModel) {
    console.warn(`[ImageGeneration] Model ${config.modelId} does not support image-to-image. Generating from prompt only.`)
  }

  // For Kontext models with reference image, use the Fireworks API directly
  if (referenceImage && isKontextModel) {
    return generateWithFireworksKontext(prompt, config, aspectRatio, referenceImage)
  }

  // Standard text-to-image generation
  const fireworks = createFireworks({ apiKey: config.apiKey })
  const model = fireworks.image(config.modelId)

  const { images } = await aiGenerateImage({
    model,
    prompt,
    n: 1,
    aspectRatio: aspectRatio as `${number}:${number}`,
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

/**
 * Fireworks FLUX Kontext image-to-image generation.
 * Uses the Fireworks API with image input for editing/style transfer.
 */
async function generateWithFireworksKontext(
  prompt: string,
  config: ImageModelConfig,
  aspectRatio: string,
  referenceImage: ReferenceImage,
): Promise<ImageGenerationResult> {
  // Convert image to base64 data URL
  const base64 = referenceImage.buffer.toString('base64')
  const dataUrl = `data:${referenceImage.mimeType};base64,${base64}`

  // Call Fireworks API directly for Kontext models
  const response = await fetch('https://api.fireworks.ai/inference/v1/workflows/accounts/fireworks/models/' + config.modelId + '/text_to_image', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      aspect_ratio: aspectRatio,
      image_url: dataUrl,
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }))
    throw createError({
      statusCode: response.status,
      statusMessage: error.error || `Fireworks Kontext failed: ${response.statusText}`,
    })
  }

  const result = await response.json() as {
    output?: { url?: string }
    data?: Array<{ url?: string }>
  }

  const imageUrl = result.output?.url || result.data?.[0]?.url
  if (!imageUrl) {
    throw createError({
      statusCode: 500,
      statusMessage: 'No image URL in Fireworks Kontext response',
    })
  }

  return downloadImage(imageUrl)
}

// ─── Replicate ───────────────────────────────────────────────────────────────

async function generateWithReplicate(
  prompt: string,
  config: ImageModelConfig,
  aspectRatio: string,
  referenceImage?: ReferenceImage,
): Promise<ImageGenerationResult> {
  if (!config.apiKey) {
    throw createError({ statusCode: 400, statusMessage: 'Replicate API key is required' })
  }

  const replicate = new Replicate({ auth: config.apiKey })

  // Build input object
  const input: Record<string, unknown> = {
    prompt,
    aspect_ratio: aspectRatio,
  }

  // Add reference image if provided (for models that support it)
  if (referenceImage) {
    // Convert to data URL for Replicate
    const base64 = referenceImage.buffer.toString('base64')
    const dataUrl = `data:${referenceImage.mimeType};base64,${base64}`
    // Different models use different parameter names
    input.image = dataUrl
    input.image_url = dataUrl
    input.init_image = dataUrl
  }

  // Run the model - Replicate uses owner/model format
  const output = await replicate.run(config.modelId as `${string}/${string}`, { input })

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
  aspectRatio: string,
  referenceImage?: ReferenceImage,
): Promise<ImageGenerationResult> {
  if (!config.apiKey) {
    throw createError({ statusCode: 400, statusMessage: 'fal.ai API key is required' })
  }

  // Configure fal client
  fal.config({ credentials: config.apiKey })

  // Build input object
  const input: Record<string, unknown> = {
    prompt,
    aspect_ratio: aspectRatio,
  }

  // Add reference image if provided (for models that support it)
  if (referenceImage) {
    // Convert to data URL for fal.ai
    const base64 = referenceImage.buffer.toString('base64')
    const dataUrl = `data:${referenceImage.mimeType};base64,${base64}`
    // fal.ai typically uses image_url parameter
    input.image_url = dataUrl
    input.image = dataUrl
  }

  // Run the model
  const result = await fal.subscribe(config.modelId, { input }) as {
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

// ─── OpenAI (GPT Image / DALL-E) ─────────────────────────────────────────────
// Uses AI SDK's generateImage for consistent interface
// Note: OpenAI uses size instead of aspectRatio, so we map common ratios to sizes

type OpenAIEditSize = '1024x1024' | '1024x1536' | '1536x1024' | '256x256' | '512x512'

function aspectRatioToOpenAISize(aspectRatio: string, modelId: string): string {
  // GPT Image models (gpt-image-1, gpt-image-1-mini) support: 1024x1024, 1024x1536, 1536x1024, auto
  // DALL-E 3 supports: 1024x1024, 1024x1792, 1792x1024
  // DALL-E 2 supports: 256x256, 512x512, 1024x1024
  const isGptImage = modelId.startsWith('gpt-image')
  const isDalle2 = modelId === 'dall-e-2'

  if (isDalle2) {
    // DALL-E 2 only supports square images
    return '1024x1024'
  }

  if (isGptImage) {
    switch (aspectRatio) {
      case '9:16':
      case '3:4':
        return '1024x1536' // Portrait
      case '16:9':
      case '21:9':
      case '4:3':
        return '1536x1024' // Landscape
      case '1:1':
      default:
        return '1024x1024' // Square
    }
  }

  // DALL-E 3
  switch (aspectRatio) {
    case '9:16':
    case '3:4':
      return '1024x1792' // Portrait
    case '16:9':
    case '21:9':
    case '4:3':
      return '1792x1024' // Landscape
    case '1:1':
    default:
      return '1024x1024' // Square
  }
}

/** Get size for images.edit endpoint (subset of sizes) */
function aspectRatioToOpenAIEditSize(aspectRatio: string, modelId: string): OpenAIEditSize {
  const isGptImage = modelId.startsWith('gpt-image')
  const isDalle2 = modelId === 'dall-e-2'

  if (isDalle2) {
    return '1024x1024'
  }

  if (isGptImage) {
    switch (aspectRatio) {
      case '9:16':
      case '3:4':
        return '1024x1536'
      case '16:9':
      case '21:9':
      case '4:3':
        return '1536x1024'
      case '1:1':
      default:
        return '1024x1024'
    }
  }

  // Fallback for any other model
  return '1024x1024'
}

async function generateWithOpenAI(
  prompt: string,
  config: ImageModelConfig,
  aspectRatio: string,
  referenceImage?: ReferenceImage,
): Promise<ImageGenerationResult> {
  if (!config.apiKey) {
    throw createError({ statusCode: 400, statusMessage: 'OpenAI API key is required' })
  }

  const openaiClient = new OpenAI({ apiKey: config.apiKey })

  // If reference image provided, use images.edit
  if (referenceImage) {
    // DALL-E 3 doesn't support image editing
    if (config.modelId === 'dall-e-3') {
      console.warn(`[ImageGeneration] Model ${config.modelId} does not support image-to-image. Generating from prompt only.`)
    }
    else {
      return generateWithOpenAIEdit(openaiClient, prompt, config, aspectRatio, referenceImage)
    }
  }

  // Standard text-to-image generation via AI SDK
  const openai = createOpenAI({ apiKey: config.apiKey })
  const model = openai.image(config.modelId)

  const { images } = await aiGenerateImage({
    model,
    prompt,
    n: 1,
    size: aspectRatioToOpenAISize(aspectRatio, config.modelId) as `${number}x${number}`,
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

/**
 * OpenAI image edit using the official SDK.
 * Supports GPT Image models (gpt-image-1, gpt-image-1-mini) and dall-e-2.
 */
async function generateWithOpenAIEdit(
  client: OpenAI,
  prompt: string,
  config: ImageModelConfig,
  aspectRatio: string,
  referenceImage: ReferenceImage,
): Promise<ImageGenerationResult> {
  // Convert buffer to a File-like object for the SDK
  const imageFile = await toFile(referenceImage.buffer, 'reference.png', {
    type: referenceImage.mimeType,
  })

  const size = aspectRatioToOpenAIEditSize(aspectRatio, config.modelId)

  const response = await client.images.edit({
    model: config.modelId,
    image: imageFile,
    prompt,
    size,
  })

  if (!response.data?.[0]?.b64_json && !response.data?.[0]?.url) {
    throw createError({
      statusCode: 500,
      statusMessage: 'No image data in OpenAI edit response',
    })
  }

  // Handle base64 response
  if (response.data[0].b64_json) {
    const buffer = Buffer.from(response.data[0].b64_json, 'base64')
    const dimensions = getImageDimensions(buffer)
    return {
      buffer,
      mimeType: 'image/png',
      ...dimensions,
    }
  }

  // Handle URL response - download the image
  return downloadImage(response.data[0].url!)
}

// ─── Together AI ─────────────────────────────────────────────────────────────
// Together AI uses their own API format for image generation

function aspectRatioToTogetherSize(aspectRatio: string): { width: number; height: number } {
  // Together AI FLUX models support various sizes
  // Common sizes: 1024x1024, 1024x768, 768x1024, 1280x720, 720x1280
  switch (aspectRatio) {
    case '16:9':
      return { width: 1280, height: 720 }
    case '9:16':
      return { width: 720, height: 1280 }
    case '21:9':
      return { width: 1280, height: 544 } // Approximation
    case '4:3':
      return { width: 1024, height: 768 }
    case '3:4':
      return { width: 768, height: 1024 }
    case '1:1':
    default:
      return { width: 1024, height: 1024 }
  }
}

async function generateWithTogether(
  prompt: string,
  config: ImageModelConfig,
  aspectRatio: string,
  referenceImage?: ReferenceImage,
): Promise<ImageGenerationResult> {
  if (!config.apiKey) {
    throw createError({ statusCode: 400, statusMessage: 'Together AI API key is required' })
  }

  // Together doesn't support image-to-image for most models
  if (referenceImage) {
    console.warn(`[ImageGeneration] Together AI model ${config.modelId} does not support image-to-image. Generating from prompt only.`)
  }

  const { width, height } = aspectRatioToTogetherSize(aspectRatio)

  const response = await fetch('https://api.together.xyz/v1/images/generations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.modelId,
      prompt,
      width,
      height,
      n: 1,
      response_format: 'b64_json',
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: response.statusText } })) as { error?: { message?: string } }
    throw createError({
      statusCode: response.status,
      statusMessage: error.error?.message || `Together AI image generation failed: ${response.statusText}`,
    })
  }

  const result = await response.json() as {
    data?: Array<{ b64_json?: string; url?: string }>
  }

  const imageData = result.data?.[0]
  if (!imageData) {
    throw createError({
      statusCode: 500,
      statusMessage: 'No image data in Together AI response',
    })
  }

  // Handle base64 response
  if (imageData.b64_json) {
    const buffer = Buffer.from(imageData.b64_json, 'base64')
    const dimensions = getImageDimensions(buffer)
    return {
      buffer,
      mimeType: 'image/png',
      ...dimensions,
    }
  }

  // Handle URL response
  if (imageData.url) {
    return downloadImage(imageData.url)
  }

  throw createError({
    statusCode: 500,
    statusMessage: 'No image data in Together AI response',
  })
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
