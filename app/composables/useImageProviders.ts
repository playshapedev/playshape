import type { imageProviders } from '~~/server/database/schema'

export type ImageProvider = typeof imageProviders.$inferSelect
export type ImageProviderType = 'openai' | 'replicate' | 'fal'

export interface ImageModelInfo {
  id: string
  name: string
  description?: string
}

// ─── Provider CRUD ───────────────────────────────────────────────────────────

export function useImageProviders() {
  const { data, pending, error, refresh } = useFetch<ImageProvider[]>('/api/settings/image-providers')
  return { providers: data, pending, error, refresh }
}

export async function createImageProvider(data: {
  name: string
  type: ImageProviderType
  apiKey?: string | null
  model: string
  isActive?: boolean
}) {
  return $fetch<ImageProvider>('/api/settings/image-providers', {
    method: 'POST',
    body: data,
  })
}

export async function updateImageProvider(id: string, data: {
  name?: string
  type?: ImageProviderType
  apiKey?: string | null
  model?: string
}) {
  return $fetch<ImageProvider>(`/api/settings/image-providers/${id}`, {
    method: 'PATCH',
    body: data,
  })
}

export async function deleteImageProvider(id: string) {
  return $fetch(`/api/settings/image-providers/${id}`, {
    method: 'DELETE',
  })
}

export async function activateImageProvider(id: string) {
  return $fetch<ImageProvider>(`/api/settings/image-providers/${id}/activate`, {
    method: 'POST',
  })
}

// ─── Provider Type Metadata ──────────────────────────────────────────────────

export const IMAGE_PROVIDER_TYPES: Record<ImageProviderType, {
  label: string
  icon: string
  defaultModels: ImageModelInfo[]
}> = {
  openai: {
    label: 'OpenAI',
    icon: 'i-simple-icons-openai',
    defaultModels: [
      { id: 'dall-e-3', name: 'DALL-E 3', description: 'Latest DALL-E model with high quality' },
      { id: 'dall-e-2', name: 'DALL-E 2', description: 'Previous generation, faster and cheaper' },
      { id: 'gpt-image-1', name: 'GPT Image 1', description: 'Native image generation from GPT-4o' },
    ],
  },
  replicate: {
    label: 'Replicate',
    icon: 'i-lucide-repeat',
    defaultModels: [
      { id: 'black-forest-labs/flux-1.1-pro', name: 'FLUX 1.1 Pro', description: 'High quality, fast generation' },
      { id: 'black-forest-labs/flux-schnell', name: 'FLUX Schnell', description: 'Fastest FLUX model' },
      { id: 'stability-ai/sdxl', name: 'SDXL', description: 'Stable Diffusion XL' },
    ],
  },
  fal: {
    label: 'fal.ai',
    icon: 'i-lucide-zap',
    defaultModels: [
      { id: 'fal-ai/flux-pro/v1.1', name: 'FLUX Pro 1.1', description: 'High quality FLUX model' },
      { id: 'fal-ai/flux/schnell', name: 'FLUX Schnell', description: 'Fast FLUX model' },
      { id: 'fal-ai/flux/dev', name: 'FLUX Dev', description: 'Development FLUX model' },
    ],
  },
}
