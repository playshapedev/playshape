import sharp from 'sharp'

const MAX_DIMENSION = 2048
const WEBP_QUALITY = 85
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB input limit

export interface ProcessedImage {
  buffer: Buffer
  mimeType: 'image/webp'
  width: number
  height: number
}

/**
 * Process an uploaded image:
 * - Validate size (max 10MB input)
 * - Resize if larger than 2048px on longest side
 * - Convert to WebP at 85% quality
 *
 * @param input - Raw image buffer from upload
 * @returns Processed image ready for storage
 * @throws Error if image is too large or invalid
 */
export async function processUploadedImage(input: Buffer): Promise<ProcessedImage> {
  if (input.length > MAX_FILE_SIZE) {
    throw createError({
      statusCode: 400,
      statusMessage: `Image exceeds maximum size of ${MAX_FILE_SIZE / 1024 / 1024}MB`,
    })
  }

  const image = sharp(input)
  const metadata = await image.metadata()

  if (!metadata.width || !metadata.height) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid image: could not determine dimensions',
    })
  }

  let pipeline = image

  // Resize if larger than max dimension (preserve aspect ratio)
  if (metadata.width > MAX_DIMENSION || metadata.height > MAX_DIMENSION) {
    pipeline = pipeline.resize(MAX_DIMENSION, MAX_DIMENSION, {
      fit: 'inside',
      withoutEnlargement: true,
    })
  }

  // Convert to WebP
  const buffer = await pipeline.webp({ quality: WEBP_QUALITY }).toBuffer()
  const outputMeta = await sharp(buffer).metadata()

  return {
    buffer,
    mimeType: 'image/webp',
    width: outputMeta.width!,
    height: outputMeta.height!,
  }
}

/**
 * Check if a MIME type is a supported image format.
 */
export function isSupportedImageType(mimeType: string): boolean {
  const supported = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/avif',
    'image/tiff',
    'image/svg+xml',
  ]
  return supported.includes(mimeType.toLowerCase())
}
