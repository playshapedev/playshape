import { join, extname } from 'node:path'
import { existsSync, mkdirSync, writeFileSync, unlinkSync, readFileSync } from 'node:fs'

/**
 * Returns the root assets directory path.
 * In development: `<project>/data/assets/`
 * In production (Electron): `<userData>/assets/`
 */
export function getAssetsDir(): string {
  if (process.env.NODE_ENV !== 'production') {
    return join(process.cwd(), 'data', 'assets')
  }

  if (process.env.PLAYSHAPE_USER_DATA) {
    return join(process.env.PLAYSHAPE_USER_DATA, 'assets')
  }

  return join(process.cwd(), 'data', 'assets')
}

/**
 * Ensures the assets directory exists.
 */
export function ensureAssetsDir(): void {
  const dir = getAssetsDir()
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

/**
 * Get the full file path for an asset.
 * @param filename - The filename (e.g., "abc123.png")
 */
export function getAssetFilePath(filename: string): string {
  return join(getAssetsDir(), filename)
}

/**
 * Generate a storage filename for an asset (legacy, single image per asset).
 * @param assetId - The asset's UUID
 * @param mimeType - The MIME type (e.g., "image/png")
 * @deprecated Use generateAssetImageFilename for new code
 */
export function generateAssetFilename(assetId: string, mimeType: string): string {
  const ext = mimeTypeToExtension(mimeType)
  return `${assetId}${ext}`
}

/**
 * Generate a storage filename for an asset image.
 * @param imageId - The asset image's UUID
 * @param mimeType - The MIME type (e.g., "image/png")
 */
export function generateAssetImageFilename(imageId: string, mimeType: string): string {
  const ext = mimeTypeToExtension(mimeType)
  return `${imageId}${ext}`
}

/**
 * Save a file to the assets directory.
 * @param filename - The filename to save as
 * @param data - The file data as a Buffer
 * @returns The relative storage path (just the filename)
 */
export function saveAssetFile(filename: string, data: Buffer): string {
  ensureAssetsDir()
  const filePath = getAssetFilePath(filename)
  writeFileSync(filePath, data)
  return filename
}

/**
 * Read an asset file.
 * @param filename - The filename to read
 * @returns The file contents as a Buffer, or null if not found
 */
export function readAssetFile(filename: string): Buffer | null {
  const filePath = getAssetFilePath(filename)
  if (!existsSync(filePath)) {
    return null
  }
  return readFileSync(filePath)
}

/**
 * Delete an asset file from disk.
 * @param filename - The filename to delete
 * @returns true if deleted, false if file didn't exist
 */
export function deleteAssetFile(filename: string): boolean {
  const filePath = getAssetFilePath(filename)
  if (!existsSync(filePath)) {
    return false
  }
  unlinkSync(filePath)
  return true
}

/**
 * Convert a MIME type to a file extension.
 */
export function mimeTypeToExtension(mimeType: string): string {
  const mimeMap: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
    'audio/mpeg': '.mp3',
    'audio/wav': '.wav',
    'audio/ogg': '.ogg',
  }
  return mimeMap[mimeType] || '.bin'
}

/**
 * Get MIME type from a file extension.
 */
export function extensionToMimeType(ext: string): string {
  const extMap: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
  }
  return extMap[ext.toLowerCase()] || 'application/octet-stream'
}

/**
 * Get the API URL for serving an asset file (legacy, single image per asset).
 * @param assetId - The asset's UUID
 * @deprecated Use getAssetImageUrl for new code
 */
export function getAssetUrl(assetId: string): string {
  return `/api/assets/${assetId}/file`
}

/**
 * Get the API URL for serving an asset image file.
 * @param assetId - The parent asset's UUID
 * @param imageId - The asset image's UUID
 */
export function getAssetImageUrl(assetId: string, imageId: string): string {
  return `/api/assets/${assetId}/images/${imageId}/file`
}
