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

// ─── Provider Type Metadata ──────────────────────────────────────────────────

export const AI_PROVIDER_META: Record<AIProviderType, {
  label: string
  icon: string
  needsApiKey: boolean
  needsBaseUrl: boolean
  defaultBaseUrl: string | null
  availableModels: ModelInfo[]
}> = {
  ollama: {
    label: 'Ollama',
    icon: 'i-simple-icons-ollama',
    needsApiKey: false,
    needsBaseUrl: true,
    defaultBaseUrl: 'http://localhost:11434',
    availableModels: [], // Discovered dynamically
  },
  lmstudio: {
    label: 'LM Studio',
    icon: 'i-lucide-monitor',
    needsApiKey: false,
    needsBaseUrl: true,
    defaultBaseUrl: 'http://localhost:1234',
    availableModels: [], // Discovered dynamically
  },
  openai: {
    label: 'OpenAI',
    icon: 'i-simple-icons-openai',
    needsApiKey: true,
    needsBaseUrl: false,
    defaultBaseUrl: null,
    availableModels: [
      { id: 'gpt-4o', name: 'GPT-4o', description: 'Most capable model', purpose: 'text' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Fast and affordable', purpose: 'text' },
      { id: 'o1', name: 'o1', description: 'Advanced reasoning', purpose: 'text' },
      { id: 'o3-mini', name: 'o3 Mini', description: 'Fast reasoning', purpose: 'text' },
      { id: 'dall-e-3', name: 'DALL-E 3', description: 'High quality images', purpose: 'image' },
      { id: 'gpt-image-1', name: 'GPT Image 1', description: 'Native GPT-4o images', purpose: 'image' },
    ],
  },
  anthropic: {
    label: 'Anthropic',
    icon: 'i-simple-icons-anthropic',
    needsApiKey: true,
    needsBaseUrl: false,
    defaultBaseUrl: null,
    availableModels: [
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', description: 'Best balance of speed and intelligence', purpose: 'text' },
      { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', description: 'Most capable', purpose: 'text' },
    ],
  },
  fireworks: {
    label: 'Fireworks AI',
    icon: 'i-lucide-flame',
    needsApiKey: true,
    needsBaseUrl: false,
    defaultBaseUrl: null,
    availableModels: [
      { id: 'accounts/fireworks/models/llama4-maverick-instruct-basic', name: 'Llama 4 Maverick', description: 'Most capable open model', purpose: 'text' },
      { id: 'accounts/fireworks/models/llama4-scout-instruct-basic', name: 'Llama 4 Scout', description: 'Fast and efficient', purpose: 'text' },
      { id: 'accounts/fireworks/models/deepseek-v3', name: 'DeepSeek V3', description: 'Strong coding and reasoning', purpose: 'text' },
      { id: 'accounts/fireworks/models/qwen3-235b-a22b', name: 'Qwen 3 235B', description: 'Large multilingual model', purpose: 'text' },
      { id: 'accounts/fireworks/models/flux-kontext-pro', name: 'FLUX Kontext Pro', description: 'High quality image editing', purpose: 'image' },
      { id: 'accounts/fireworks/models/flux-kontext-max', name: 'FLUX Kontext Max', description: 'Maximum quality images', purpose: 'image' },
    ],
  },
  replicate: {
    label: 'Replicate',
    icon: 'i-lucide-repeat',
    needsApiKey: true,
    needsBaseUrl: false,
    defaultBaseUrl: null,
    availableModels: [
      { id: 'black-forest-labs/flux-1.1-pro', name: 'FLUX 1.1 Pro', description: 'High quality, fast', purpose: 'image' },
      { id: 'black-forest-labs/flux-schnell', name: 'FLUX Schnell', description: 'Fastest FLUX', purpose: 'image' },
      { id: 'stability-ai/sdxl', name: 'SDXL', description: 'Stable Diffusion XL', purpose: 'image' },
    ],
  },
  fal: {
    label: 'fal.ai',
    icon: 'i-lucide-zap',
    needsApiKey: true,
    needsBaseUrl: false,
    defaultBaseUrl: null,
    availableModels: [
      { id: 'fal-ai/flux-pro/v1.1', name: 'FLUX Pro 1.1', description: 'High quality', purpose: 'image' },
      { id: 'fal-ai/flux/schnell', name: 'FLUX Schnell', description: 'Fast generation', purpose: 'image' },
      { id: 'fal-ai/flux/dev', name: 'FLUX Dev', description: 'Development model', purpose: 'image' },
    ],
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
