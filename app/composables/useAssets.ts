import type { assets, assetImages } from '~~/server/database/schema'

export type Asset = typeof assets.$inferSelect
export type AssetImage = typeof assetImages.$inferSelect

/** Asset with its images included */
export interface AssetWithImages extends Asset {
  images: AssetImage[]
  imageCount: number
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
 * Get a single asset by ID with its images.
 */
export function useAsset(id: string) {
  const { data, pending, error, refresh } = useFetch<AssetWithImages>(`/api/assets/${id}`)

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
