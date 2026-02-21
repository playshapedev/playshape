/**
 * Video URL parsing utilities for YouTube and Vimeo.
 * Extracts video IDs and generates embed URLs.
 */

export type VideoSource = 'youtube' | 'vimeo' | 'upload'

export interface ParsedVideoUrl {
  source: 'youtube' | 'vimeo'
  videoId: string
  embedUrl: string
  thumbnailUrl: string
}

/**
 * Parse a video URL and extract platform, video ID, and embed URL.
 * Returns null if the URL is not a recognized video platform.
 */
export function parseVideoUrl(url: string): ParsedVideoUrl | null {
  const trimmedUrl = url.trim()

  // Try YouTube first
  const youtubeId = extractYouTubeId(trimmedUrl)
  if (youtubeId) {
    return {
      source: 'youtube',
      videoId: youtubeId,
      embedUrl: `https://www.youtube.com/embed/${youtubeId}`,
      thumbnailUrl: `https://img.youtube.com/vi/${youtubeId}/maxresdefault.jpg`,
    }
  }

  // Try Vimeo
  const vimeoId = extractVimeoId(trimmedUrl)
  if (vimeoId) {
    return {
      source: 'vimeo',
      videoId: vimeoId,
      embedUrl: `https://player.vimeo.com/video/${vimeoId}`,
      // Vimeo thumbnails require API call, so use a placeholder
      // In a real app, you'd fetch from https://vimeo.com/api/v2/video/{id}.json
      thumbnailUrl: `https://vumbnail.com/${vimeoId}.jpg`,
    }
  }

  return null
}

/**
 * Extract YouTube video ID from various URL formats:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 * - https://www.youtube.com/v/VIDEO_ID
 * - https://www.youtube.com/shorts/VIDEO_ID
 */
function extractYouTubeId(url: string): string | null {
  // Standard watch URL
  const watchMatch = url.match(/(?:youtube\.com\/watch\?.*v=|youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/)
  if (watchMatch?.[1]) return watchMatch[1]

  // Short URL (youtu.be)
  const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/)
  if (shortMatch?.[1]) return shortMatch[1]

  // Embed URL
  const embedMatch = url.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/)
  if (embedMatch?.[1]) return embedMatch[1]

  // Old embed URL
  const oldEmbedMatch = url.match(/youtube\.com\/v\/([a-zA-Z0-9_-]{11})/)
  if (oldEmbedMatch?.[1]) return oldEmbedMatch[1]

  // Shorts URL
  const shortsMatch = url.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/)
  if (shortsMatch?.[1]) return shortsMatch[1]

  return null
}

/**
 * Extract Vimeo video ID from various URL formats:
 * - https://vimeo.com/VIDEO_ID
 * - https://player.vimeo.com/video/VIDEO_ID
 * - https://vimeo.com/channels/CHANNEL/VIDEO_ID
 * - https://vimeo.com/groups/GROUP/videos/VIDEO_ID
 */
function extractVimeoId(url: string): string | null {
  // Standard Vimeo URL
  const standardMatch = url.match(/vimeo\.com\/(\d+)/)
  if (standardMatch?.[1]) return standardMatch[1]

  // Player embed URL
  const playerMatch = url.match(/player\.vimeo\.com\/video\/(\d+)/)
  if (playerMatch?.[1]) return playerMatch[1]

  // Channel URL
  const channelMatch = url.match(/vimeo\.com\/channels\/[^/]+\/(\d+)/)
  if (channelMatch?.[1]) return channelMatch[1]

  // Groups URL
  const groupsMatch = url.match(/vimeo\.com\/groups\/[^/]+\/videos\/(\d+)/)
  if (groupsMatch?.[1]) return groupsMatch[1]

  return null
}

/**
 * Check if a URL is a valid YouTube or Vimeo video URL.
 */
export function isVideoUrl(url: string): boolean {
  return parseVideoUrl(url) !== null
}

/**
 * Get the embed URL for a video (YouTube or Vimeo).
 * Returns null if not a recognized video platform.
 */
export function getEmbedUrl(url: string): string | null {
  const parsed = parseVideoUrl(url)
  return parsed?.embedUrl ?? null
}

/**
 * Get the thumbnail URL for a video (YouTube or Vimeo).
 * Returns null if not a recognized video platform.
 */
export function getThumbnailUrl(url: string): string | null {
  const parsed = parseVideoUrl(url)
  return parsed?.thumbnailUrl ?? null
}
