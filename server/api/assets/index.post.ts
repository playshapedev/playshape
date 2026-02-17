import { assets } from '~~/server/database/schema'
import { generateAssetFilename, saveAssetFile } from '~~/server/utils/assetStorage'

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
  const id = crypto.randomUUID()

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
    const filename = generateAssetFilename(id, mimeType)
    const buffer = Buffer.from(fileField.data)

    // Save file to disk
    saveAssetFile(filename, buffer)

    // Get image dimensions if it's an image
    let width: number | undefined
    let height: number | undefined
    if (mimeType.startsWith('image/')) {
      const dimensions = getImageDimensions(buffer)
      width = dimensions.width
      height = dimensions.height
    }

    // Create asset record
    const asset = {
      id,
      projectId: projectIdField?.data?.toString() || null,
      type: mimeType.startsWith('image/') ? 'image' as const : 'audio' as const,
      name: nameField?.data?.toString() || fileField.filename || 'Uploaded file',
      prompt: null,
      storagePath: filename,
      mimeType,
      width: width ?? null,
      height: height ?? null,
      fileSize: buffer.length,
      messages: [],
      createdAt: now,
      updatedAt: now,
    }

    db.insert(assets).values(asset).run()

    return asset
  }

  // Handle JSON body (create empty asset for generation)
  const body = await readBody<{
    name?: string
    projectId?: string
  }>(event)

  const asset = {
    id,
    projectId: body.projectId || null,
    type: 'image' as const,
    name: body.name || 'Untitled',
    prompt: null,
    storagePath: '', // Will be set when image is generated
    mimeType: null,
    width: null,
    height: null,
    fileSize: null,
    messages: [],
    createdAt: now,
    updatedAt: now,
  }

  db.insert(assets).values(asset).run()

  return asset
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
