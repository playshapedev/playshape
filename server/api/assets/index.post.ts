import { assets, assetImages } from '~~/server/database/schema'
import { generateAssetImageFilename, saveAssetFile } from '~~/server/utils/assetStorage'

/**
 * Create a new asset.
 * POST /api/assets
 *
 * Body can be:
 * - { name: string, projectId?: string } - Creates an empty asset for generation
 * - multipart/form-data with file - Uploads a file
 */
export default defineEventHandler(async (event) => {
  const contentType = getHeader(event, 'content-type') || ''
  const db = useDb()
  const now = new Date()
  const assetId = crypto.randomUUID()

  // Handle file upload (multipart/form-data)
  if (contentType.includes('multipart/form-data')) {
    const formData = await readMultipartFormData(event)
    if (!formData) {
      throw createError({ statusCode: 400, statusMessage: 'No form data received' })
    }

    const fileField = formData.find(f => f.name === 'file')
    const nameField = formData.find(f => f.name === 'name')
    const projectIdField = formData.find(f => f.name === 'projectId')

    if (!fileField?.data || !fileField.type) {
      throw createError({ statusCode: 400, statusMessage: 'No file uploaded' })
    }

    const mimeType = fileField.type
    const buffer = Buffer.from(fileField.data)

    // Create asset record
    const asset = {
      id: assetId,
      projectId: projectIdField?.data?.toString() || null,
      type: mimeType.startsWith('image/') ? 'image' as const : 'audio' as const,
      name: nameField?.data?.toString() || fileField.filename || 'Uploaded file',
      messages: [],
      createdAt: now,
      updatedAt: now,
    }

    db.insert(assets).values(asset).run()

    // Create image record
    const imageId = crypto.randomUUID()
    const filename = generateAssetImageFilename(imageId, mimeType)
    saveAssetFile(filename, buffer)

    // Get image dimensions if it's an image
    let width: number | undefined
    let height: number | undefined
    if (mimeType.startsWith('image/')) {
      const dimensions = getImageDimensions(buffer)
      width = dimensions.width
      height = dimensions.height
    }

    const image = {
      id: imageId,
      assetId,
      prompt: null,
      storagePath: filename,
      mimeType,
      width: width ?? null,
      height: height ?? null,
      fileSize: buffer.length,
      createdAt: now,
    }

    db.insert(assetImages).values(image).run()

    return {
      ...asset,
      images: [image],
      imageCount: 1,
    }
  }

  // Handle JSON body (create empty asset for generation or video)
  const body = await readBody<{
    name?: string
    projectId?: string
    type?: 'image' | 'video'
  }>(event)

  const assetType = body.type || 'image'

  const asset = {
    id: assetId,
    projectId: body.projectId || null,
    type: assetType,
    name: body.name || 'Untitled',
    messages: [],
    createdAt: now,
    updatedAt: now,
  }

  db.insert(assets).values(asset).run()

  return {
    ...asset,
    images: [],
    imageCount: 0,
    videos: [],
    videoCount: 0,
  }
})

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

  // JPEG: scan for SOF marker
  if (buffer.length > 2 && buffer[0] === 0xFF && buffer[1] === 0xD8) {
    let offset = 2
    while (offset < buffer.length - 8) {
      if (buffer[offset] !== 0xFF) {
        offset++
        continue
      }
      const marker = buffer[offset + 1]!
      if (marker >= 0xC0 && marker <= 0xC3) {
        const height = buffer.readUInt16BE(offset + 5)
        const width = buffer.readUInt16BE(offset + 7)
        return { width, height }
      }
      const length = buffer.readUInt16BE(offset + 2)
      offset += 2 + length
    }
  }

  return {}
}
