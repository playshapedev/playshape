import type { aiProviders, aiModels } from '~~/server/database/schema'

export type AIProvider = typeof aiProviders.$inferSelect
export type AIModel = typeof aiModels.$inferSelect
export type AIProviderType = 'ollama' | 'lmstudio' | 'openai' | 'anthropic' | 'fireworks' | 'replicate' | 'fal'
export type AIModelPurpose = 'text' | 'image'

export interface AIProviderWithModels extends AIProvider {
  models: AIModel[]
}

export interface ModelInfo {
  id: string
  name: string
  description?: string
  purpose: AIModelPurpose
}

// ─── Provider CRUD ───────────────────────────────────────────────────────────

export function useAIProviders() {
  const { data, pending, error, refresh } = useFetch<AIProviderWithModels[]>('/api/settings/ai-providers')
  return { providers: data, pending, error, refresh }
}

export async function createAIProvider(data: {
  type: AIProviderType
  name?: string
  baseUrl?: string | null
  apiKey?: string | null
}) {
  return $fetch<AIProvider>('/api/settings/ai-providers', {
    method: 'POST',
    body: data,
  })
}

export async function updateAIProvider(id: string, data: {
  name?: string
  baseUrl?: string | null
  apiKey?: string | null
}) {
  return $fetch<AIProvider>(`/api/settings/ai-providers/${id}`, {
    method: 'PATCH',
    body: data,
  })
}

export async function deleteAIProvider(id: string) {
  return $fetch(`/api/settings/ai-providers/${id}`, {
    method: 'DELETE',
  })
}

// ─── Model CRUD ──────────────────────────────────────────────────────────────

export async function addAIModel(data: {
  providerId: string
  modelId: string
  name: string
  purpose: AIModelPurpose
  isActive?: boolean
}) {
  return $fetch<AIModel>('/api/settings/ai-models', {
    method: 'POST',
    body: data,
  })
}

export async function removeAIModel(id: string) {
  return $fetch(`/api/settings/ai-models/${id}`, {
    method: 'DELETE',
  })
}

export async function activateAIModel(id: string) {
  return $fetch<AIModel>(`/api/settings/ai-models/${id}/activate`, {
    method: 'POST',
  })
}

// ─── Model Discovery ─────────────────────────────────────────────────────────

/**
 * Discover available models for a provider.
 * For local providers, queries the running server.
 * For cloud providers with API support, fetches from their API.
 */
export async function discoverModels(providerId: string) {
  return $fetch<ModelInfo[]>(`/api/settings/ai-providers/${providerId}/models`)
}

// ─── Provider Type Metadata ──────────────────────────────────────────────────

export const AI_PROVIDER_META: Record<AIProviderType, {
  label: string
  icon: string
  needsApiKey: boolean
  needsBaseUrl: boolean
  defaultBaseUrl: string | null
}> = {
  ollama: {
    label: 'Ollama',
    icon: 'i-simple-icons-ollama',
    needsApiKey: false,
    needsBaseUrl: true,
    defaultBaseUrl: 'http://localhost:11434',
  },
  lmstudio: {
    label: 'LM Studio',
    icon: 'i-lucide-monitor',
    needsApiKey: false,
    needsBaseUrl: true,
    defaultBaseUrl: 'http://localhost:1234',
  },
  openai: {
    label: 'OpenAI',
    icon: 'i-simple-icons-openai',
    needsApiKey: true,
    needsBaseUrl: false,
    defaultBaseUrl: null,
  },
  anthropic: {
    label: 'Anthropic',
    icon: 'i-simple-icons-anthropic',
    needsApiKey: true,
    needsBaseUrl: false,
    defaultBaseUrl: null,
  },
  fireworks: {
    label: 'Fireworks AI',
    icon: 'i-lucide-flame',
    needsApiKey: true,
    needsBaseUrl: false,
    defaultBaseUrl: null,
  },
  replicate: {
    label: 'Replicate',
    icon: 'i-lucide-repeat',
    needsApiKey: true,
    needsBaseUrl: false,
    defaultBaseUrl: null,
  },
  fal: {
    label: 'fal.ai',
    icon: 'i-lucide-zap',
    needsApiKey: true,
    needsBaseUrl: false,
    defaultBaseUrl: null,
  },
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function getActiveTextModel(providers: AIProviderWithModels[] | null) {
  if (!providers) return null
  for (const provider of providers) {
    const active = provider.models.find(m => m.purpose === 'text' && m.isActive)
    if (active) return { provider, model: active }
  }
  return null
}

export function getActiveImageModel(providers: AIProviderWithModels[] | null) {
  if (!providers) return null
  for (const provider of providers) {
    const active = provider.models.find(m => m.purpose === 'image' && m.isActive)
    if (active) return { provider, model: active }
  }
  return null
}
