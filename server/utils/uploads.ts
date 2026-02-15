import { join } from 'node:path'
import { existsSync, mkdirSync } from 'node:fs'

/**
 * Returns the root uploads directory path.
 * In development: `<project>/data/uploads/`
 * In production (Electron): `<userData>/uploads/`
 */
export function getUploadsDir(): string {
  if (process.env.NODE_ENV !== 'production') {
    return join(process.cwd(), 'data', 'uploads')
  }

  if (process.env.PLAYSHAPE_USER_DATA) {
    return join(process.env.PLAYSHAPE_USER_DATA, 'uploads')
  }

  return join(process.cwd(), 'data', 'uploads')
}

/**
 * Returns the upload directory for a specific document within a library,
 * creating it if it doesn't exist.
 */
export function getDocumentUploadDir(libraryId: string, documentId: string): string {
  const dir = join(getUploadsDir(), libraryId, documentId)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}
