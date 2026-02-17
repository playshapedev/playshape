import type { assets } from '~~/server/database/schema'

export type Asset = typeof assets.$inferSelect

/**
 * List all assets, optionally filtered by project.
 */
export function useAssets(projectId?: string) {
  const url = projectId
    ? `/api/assets?projectId=${projectId}`
    : '/api/assets'

  const { data, pending, error, refresh } = useFetch<Asset[]>(url)

  return { assets: data, pending, error, refresh }
}

/**
 * Get a single asset by ID.
 */
export function useAsset(id: string) {
  const { data, pending, error, refresh } = useFetch<Asset>(`/api/assets/${id}`)

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
 * Get the URL for an asset's file.
 */
export function getAssetFileUrl(id: string) {
  return `/api/assets/${id}/file`
}
