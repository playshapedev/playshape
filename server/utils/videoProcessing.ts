/**
 * Video processing utilities using ffmpeg.
 * Handles compression, thumbnail extraction, and metadata retrieval.
 */

import { spawn } from 'node:child_process'
import { getFfmpegPath, getFfprobePath } from './ffmpegPath'

export interface VideoMetadata {
  duration: number // seconds
  width: number
  height: number
  codec: string
  fileSize: number // bytes
}

export interface CompressionOptions {
  /** Maximum width (height scales proportionally). Default: 1920 */
  maxWidth?: number
  /** Maximum height (width scales proportionally). Default: 1080 */
  maxHeight?: number
  /** Video bitrate in kbps. Default: auto based on resolution */
  videoBitrate?: number
  /** Audio bitrate in kbps. Default: 128 */
  audioBitrate?: number
  /** Constant Rate Factor for quality (0-51, lower = better). Default: 23 */
  crf?: number
}

/**
 * Compress a video file for web playback.
 * Outputs H.264 video with AAC audio in an MP4 container.
 * 
 * @param inputPath Path to the source video file
 * @param outputPath Path for the compressed output (should end in .mp4)
 * @param options Compression settings
 * @returns Metadata about the compressed video
 */
export function compressVideo(
  inputPath: string,
  outputPath: string,
  options: CompressionOptions = {},
): Promise<VideoMetadata> {
  const {
    maxWidth = 1920,
    maxHeight = 1080,
    audioBitrate = 128,
    crf = 23,
  } = options

  return new Promise((resolve, reject) => {
    const ffmpegPath = getFfmpegPath()

    // Build filter for scaling (maintains aspect ratio, only downscales)
    const scaleFilter = `scale='min(${maxWidth},iw)':min'(${maxHeight},ih)':force_original_aspect_ratio=decrease`

    const args = [
      '-i', inputPath,
      '-y', // Overwrite output
      '-c:v', 'libx264', // H.264 video codec
      '-preset', 'medium', // Balance between speed and compression
      '-crf', String(crf), // Quality setting
      '-vf', scaleFilter, // Scale filter
      '-c:a', 'aac', // AAC audio codec
      '-b:a', `${audioBitrate}k`, // Audio bitrate
      '-movflags', '+faststart', // Enable streaming
      '-pix_fmt', 'yuv420p', // Ensure compatibility
      outputPath,
    ]

    const ffmpeg = spawn(ffmpegPath, args)

    let stderr = ''
    ffmpeg.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    ffmpeg.on('error', (err) => {
      reject(new Error(`Failed to start ffmpeg: ${err.message}`))
    })

    ffmpeg.on('close', async (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg exited with code ${code}: ${stderr}`))
        return
      }

      try {
        const metadata = await getVideoMetadata(outputPath)
        resolve(metadata)
      }
      catch (err) {
        reject(err)
      }
    })
  })
}

/**
 * Extract a thumbnail frame from a video.
 * 
 * @param videoPath Path to the video file
 * @param outputPath Path for the thumbnail image (should end in .jpg or .png)
 * @param timestamp Time in seconds to extract the frame. Default: 1
 */
export function extractThumbnail(
  videoPath: string,
  outputPath: string,
  timestamp: number = 1,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpegPath = getFfmpegPath()

    const args = [
      '-i', videoPath,
      '-y', // Overwrite output
      '-ss', String(timestamp), // Seek to timestamp
      '-vframes', '1', // Extract one frame
      '-vf', 'scale=640:-1', // Scale to 640px width, maintain aspect ratio
      '-q:v', '2', // High quality JPEG
      outputPath,
    ]

    const ffmpeg = spawn(ffmpegPath, args)

    let stderr = ''
    ffmpeg.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    ffmpeg.on('error', (err) => {
      reject(new Error(`Failed to start ffmpeg: ${err.message}`))
    })

    ffmpeg.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg thumbnail extraction failed: ${stderr}`))
        return
      }
      resolve()
    })
  })
}

/**
 * Get metadata about a video file.
 * 
 * @param videoPath Path to the video file
 * @returns Video metadata including duration, dimensions, and codec
 */
export function getVideoMetadata(videoPath: string): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    const ffprobePath = getFfprobePath()
    const fs = require('node:fs')

    // Get file size
    let fileSize = 0
    try {
      const stats = fs.statSync(videoPath)
      fileSize = stats.size
    }
    catch {
      // File might not exist yet
    }

    const args = [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      videoPath,
    ]

    const ffprobe = spawn(ffprobePath, args)

    let stdout = ''
    let stderr = ''

    ffprobe.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString()
    })

    ffprobe.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    ffprobe.on('error', (err) => {
      reject(new Error(`Failed to start ffprobe: ${err.message}`))
    })

    ffprobe.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe failed: ${stderr}`))
        return
      }

      try {
        const data = JSON.parse(stdout)
        const videoStream = data.streams?.find((s: { codec_type: string }) => s.codec_type === 'video')

        if (!videoStream) {
          reject(new Error('No video stream found'))
          return
        }

        resolve({
          duration: parseFloat(data.format?.duration || '0'),
          width: videoStream.width || 0,
          height: videoStream.height || 0,
          codec: videoStream.codec_name || 'unknown',
          fileSize: fileSize || parseInt(data.format?.size || '0', 10),
        })
      }
      catch (err) {
        reject(new Error(`Failed to parse ffprobe output: ${err}`))
      }
    })
  })
}

/**
 * Check if ffmpeg is available on the system.
 */
export async function isFFmpegAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const ffmpegPath = getFfmpegPath()
    const ffmpeg = spawn(ffmpegPath, ['-version'])

    ffmpeg.on('error', () => {
      resolve(false)
    })

    ffmpeg.on('close', (code) => {
      resolve(code === 0)
    })
  })
}
