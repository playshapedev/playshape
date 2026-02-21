import { join } from 'node:path'
import { existsSync } from 'node:fs'

/**
 * Returns the path to the ffmpeg binary.
 * 
 * In development: Uses the ffmpeg-static package path (requires ffmpeg-static installed)
 * In production: Uses the bundled binary in Electron's resources directory
 */
export function getFfmpegPath(): string {
  // Production: bundled in extraResources via electron-builder
  if (process.env.NODE_ENV === 'production' && process.env.PLAYSHAPE_RESOURCES_PATH) {
    const resourcesPath = process.env.PLAYSHAPE_RESOURCES_PATH
    const binaryName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
    const bundledPath = join(resourcesPath, binaryName)
    if (existsSync(bundledPath)) {
      return bundledPath
    }
    console.warn(`[ffmpeg] Bundled binary not found at ${bundledPath}, falling back to ffmpeg-static`)
  }

  // Development: use ffmpeg-static directly
  // Dynamic import to avoid bundling issues with Nitro
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ffmpegStatic = require('ffmpeg-static')
    if (ffmpegStatic && existsSync(ffmpegStatic)) {
      return ffmpegStatic
    }
  }
  catch {
    // ffmpeg-static not available
  }

  // Fallback: assume ffmpeg is in PATH
  console.warn('[ffmpeg] ffmpeg-static not found, assuming ffmpeg is in system PATH')
  return 'ffmpeg'
}

/**
 * Returns the path to the ffprobe binary.
 * ffprobe is used for extracting video metadata.
 * 
 * Note: ffmpeg-static doesn't include ffprobe, so in dev we rely on system ffprobe.
 * For production, we'd need to bundle ffprobe separately or use ffmpeg for metadata.
 */
export function getFfprobePath(): string {
  // Production: bundled in extraResources
  if (process.env.NODE_ENV === 'production' && process.env.PLAYSHAPE_RESOURCES_PATH) {
    const resourcesPath = process.env.PLAYSHAPE_RESOURCES_PATH
    const binaryName = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe'
    const bundledPath = join(resourcesPath, binaryName)
    if (existsSync(bundledPath)) {
      return bundledPath
    }
  }

  // Fallback: assume ffprobe is in PATH (installed with ffmpeg)
  return 'ffprobe'
}
