import { chatAttachments } from '~~/server/database/schema'
import { processUploadedImage, isSupportedImageType } from '~~/server/utils/imageProcessing'
import {
  generateAttachmentFilename,
  saveAttachmentFile,
  getAttachmentUrl,
} from '~~/server/utils/attachmentStorage'

/**
 * Upload a chat attachment (image).
 *
 * Accepts multipart form data with:
 * - file: The image file
 * - messageId: The chat message ID this attachment belongs to
 * - assetId (optional): The asset ID if this is an asset chat
 * - templateId (optional): The template ID if this is a template chat
 *
 * Returns the attachment metadata including the URL to serve it.
 */
export default defineEventHandler(async (event) => {
  const formData = await readMultipartFormData(event)

  if (!formData) {
    throw createError({
      statusCode: 400,
      statusMessage: 'No form data provided',
    })
  }

  // Extract fields from multipart data
  let file: { filename?: string; type?: string; data: Buffer } | undefined
  let messageId: string | undefined
  let assetId: string | undefined
  let templateId: string | undefined

  for (const field of formData) {
    if (field.name === 'file' && field.data) {
      file = {
        filename: field.filename,
        type: field.type,
        data: field.data,
      }
    }
    else if (field.name === 'messageId') {
      messageId = field.data.toString('utf-8')
    }
    else if (field.name === 'assetId') {
      assetId = field.data.toString('utf-8')
    }
    else if (field.name === 'templateId') {
      templateId = field.data.toString('utf-8')
    }
  }

  // Validate required fields
  if (!file) {
    throw createError({
      statusCode: 400,
      statusMessage: 'No file provided',
    })
  }

  if (!messageId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'messageId is required',
    })
  }

  if (!assetId && !templateId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Either assetId or templateId is required',
    })
  }

  // Validate file type
  if (file.type && !isSupportedImageType(file.type)) {
    throw createError({
      statusCode: 400,
      statusMessage: `Unsupported image type: ${file.type}. Supported types: JPEG, PNG, GIF, WebP, AVIF, TIFF, SVG.`,
    })
  }

  // Process the image (resize, convert to WebP)
  const processed = await processUploadedImage(file.data)

  // Generate ID and save to disk
  const id = crypto.randomUUID()
  const filename = generateAttachmentFilename(id)
  saveAttachmentFile(filename, processed.buffer)

  // Save to database
  const db = useDb()
  const now = new Date()

  db.insert(chatAttachments)
    .values({
      id,
      assetId: assetId || null,
      templateId: templateId || null,
      messageId,
      storagePath: filename,
      mimeType: processed.mimeType,
      filename: file.filename || null,
      width: processed.width,
      height: processed.height,
      fileSize: processed.buffer.length,
      createdAt: now,
    })
    .run()

  // Return a data URL so it works with external LLM providers
  // The relative URL is stored in the DB for serving to the frontend
  const base64 = processed.buffer.toString('base64')
  const dataUrl = `data:${processed.mimeType};base64,${base64}`

  return {
    id,
    url: dataUrl, // Data URL for LLM providers
    serveUrl: getAttachmentUrl(id), // Relative URL for serving in UI
    mediaType: processed.mimeType,
    width: processed.width,
    height: processed.height,
    fileSize: processed.buffer.length,
    filename: file.filename,
  }
})
