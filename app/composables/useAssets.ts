import type { assets, assetImages, assetVideos } from '~~/server/database/schema'

export type Asset = typeof assets.$inferSelect
export type AssetImage = typeof assetImages.$inferSelect
export type AssetVideo = typeof assetVideos.$inferSelect

/** Asset with its images included */
export interface AssetWithImages extends Asset {
  images: AssetImage[]
  imageCount: number
}

/** Asset with its videos included */
export interface AssetWithVideos extends Asset {
  videos: AssetVideo[]
  videoCount: number
}

/** Asset with both images and videos */
export interface AssetWithMedia extends Asset {
  images: AssetImage[]
  imageCount: number
  videos: AssetVideo[]
  videoCount: number
}

/**
 * List all assets with their images, optionally filtered by project.
 */
export function useAssets(projectId?: string) {
  const url = projectId
    ? `/api/assets?projectId=${projectId}`
    : '/api/assets'

  const { data, pending, error, refresh } = useFetch<AssetWithImages[]>(url)

  return { assets: data, pending, error, refresh }
}

/**
 * Get a single asset by ID with its images and videos.
 */
export function useAsset(id: string) {
  const { data, pending, error, refresh } = useFetch<AssetWithMedia>(`/api/assets/${id}`)

  return { asset: data, pending, error, refresh }
}

/**
 * Create a new asset (empty, for image generation).
 */
export async function createAsset(data: {
  name?: string
  projectId?: string
} = {}) {
  return $fetch<Asset>('/api/assets', {
    method: 'POST',
    body: data,
  })
}

/**
 * Upload a file as a new asset.
 */
export async function uploadAsset(file: File, projectId?: string) {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('name', file.name)
  if (projectId) {
    formData.append('projectId', projectId)
  }

  return $fetch<Asset>('/api/assets', {
    method: 'POST',
    body: formData,
  })
}

/**
 * Update an asset's metadata.
 */
export async function updateAsset(id: string, data: {
  name?: string
  projectId?: string | null
}) {
  return $fetch<Asset>(`/api/assets/${id}`, {
    method: 'PATCH',
    body: data,
  })
}

/**
 * Delete an asset.
 */
export async function deleteAsset(id: string) {
  return $fetch(`/api/assets/${id}`, {
    method: 'DELETE',
  })
}

/**
 * Get the URL for an asset's file (legacy, single image).
 * @deprecated Use getAssetImageUrl for new code
 */
export function getAssetFileUrl(id: string) {
  return `/api/assets/${id}/file`
}

/**
 * Get the URL for an asset image file.
 */
export function getAssetImageUrl(assetId: string, imageId: string) {
  return `/api/assets/${assetId}/images/${imageId}/file`
}

/**
 * Get the URL for an asset video file.
 */
export function getAssetVideoUrl(assetId: string, videoId: string) {
  return `/api/assets/${assetId}/videos/${videoId}/file`
}

/**
 * Get the URL for an asset video thumbnail.
 */
export function getAssetVideoThumbnailUrl(assetId: string, videoId: string) {
  return `/api/assets/${assetId}/videos/${videoId}/thumbnail`
}

/**
 * Create a new video asset (empty, for adding videos).
 */
export async function createVideoAsset(data: {
  name?: string
  projectId?: string
} = {}) {
  return $fetch<Asset>('/api/assets', {
    method: 'POST',
    body: { ...data, type: 'video' },
  })
}

/**
 * Upload a video file to an existing video asset.
 * Returns the created video record.
 */
export async function uploadVideoToAsset(assetId: string, file: File) {
  const formData = new FormData()
  formData.append('file', file)

  return $fetch<AssetVideo>(`/api/assets/${assetId}/videos`, {
    method: 'POST',
    body: formData,
  })
}

/**
 * Create a video asset from a YouTube or Vimeo URL.
 */
export async function createVideoFromUrl(url: string, options: {
  name?: string
  projectId?: string
} = {}) {
  return $fetch<{
    id: string
    videoId: string
    type: 'video'
    name: string
    video: {
      id: string
      source: 'youtube' | 'vimeo'
      url: string
      thumbnailUrl: string
    }
  }>('/api/assets/videos/url', {
    method: 'POST',
    body: { url, ...options },
  })
}
