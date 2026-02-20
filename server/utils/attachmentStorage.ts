import { join } from 'node:path'
import { existsSync, mkdirSync, writeFileSync, unlinkSync, readFileSync } from 'node:fs'

/**
 * Returns the root attachments directory path.
 * In development: `<project>/data/attachments/`
 * In production (Electron): `<userData>/attachments/`
 */
export function getAttachmentsDir(): string {
  if (process.env.NODE_ENV !== 'production') {
    return join(process.cwd(), 'data', 'attachments')
  }

  if (process.env.PLAYSHAPE_USER_DATA) {
    return join(process.env.PLAYSHAPE_USER_DATA, 'attachments')
  }

  return join(process.cwd(), 'data', 'attachments')
}

/**
 * Ensures the attachments directory exists.
 */
export function ensureAttachmentsDir(): void {
  const dir = getAttachmentsDir()
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

/**
 * Get the full file path for an attachment.
 * @param filename - The filename (e.g., "abc123.webp")
 */
export function getAttachmentFilePath(filename: string): string {
  return join(getAttachmentsDir(), filename)
}

/**
 * Generate a storage filename for an attachment.
 * All attachments are stored as WebP after processing.
 * @param attachmentId - The attachment's UUID
 */
export function generateAttachmentFilename(attachmentId: string): string {
  return `${attachmentId}.webp`
}

/**
 * Save an attachment file to the attachments directory.
 * @param filename - The filename to save as
 * @param data - The file data as a Buffer
 * @returns The relative storage path (just the filename)
 */
export function saveAttachmentFile(filename: string, data: Buffer): string {
  ensureAttachmentsDir()
  const filePath = getAttachmentFilePath(filename)
  writeFileSync(filePath, data)
  return filename
}

/**
 * Read an attachment file.
 * @param filename - The filename to read
 * @returns The file contents as a Buffer, or null if not found
 */
export function readAttachmentFile(filename: string): Buffer | null {
  const filePath = getAttachmentFilePath(filename)
  if (!existsSync(filePath)) {
    return null
  }
  return readFileSync(filePath)
}

/**
 * Delete an attachment file from disk.
 * @param filename - The filename to delete
 * @returns true if deleted, false if file didn't exist
 */
export function deleteAttachmentFile(filename: string): boolean {
  const filePath = getAttachmentFilePath(filename)
  if (!existsSync(filePath)) {
    return false
  }
  unlinkSync(filePath)
  return true
}

/**
 * Get the API URL for serving an attachment file.
 * @param attachmentId - The attachment's UUID
 */
export function getAttachmentUrl(attachmentId: string): string {
  return `/api/attachments/${attachmentId}/file`
}
