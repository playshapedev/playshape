import type { llmProviders } from '~~/server/database/schema'

export type LLMProvider = typeof llmProviders.$inferSelect
export type LLMProviderType = 'ollama' | 'lmstudio' | 'openai' | 'anthropic' | 'fireworks'

export interface ModelInfo {
  id: string
  name: string
  description?: string
}

export interface TestResult {
  ok: boolean
  response?: string
}

// ─── Provider CRUD ───────────────────────────────────────────────────────────

export function useLLMProviders() {
  const { data, pending, error, refresh } = useFetch<LLMProvider[]>('/api/settings/llm-providers')
  return { providers: data, pending, error, refresh }
}

export async function createLLMProvider(data: {
  name: string
  type: LLMProviderType
  baseUrl?: string | null
  apiKey?: string | null
  model: string
  isActive?: boolean
}) {
  return $fetch<LLMProvider>('/api/settings/llm-providers', {
    method: 'POST',
    body: data,
  })
}

export async function updateLLMProvider(id: string, data: {
  name?: string
  type?: LLMProviderType
  baseUrl?: string | null
  apiKey?: string | null
  model?: string
}) {
  return $fetch<LLMProvider>(`/api/settings/llm-providers/${id}`, {
    method: 'PATCH',
    body: data,
  })
}

export async function deleteLLMProvider(id: string) {
  return $fetch(`/api/settings/llm-providers/${id}`, {
    method: 'DELETE',
  })
}

export async function activateLLMProvider(id: string) {
  return $fetch<LLMProvider>(`/api/settings/llm-providers/${id}/activate`, {
    method: 'POST',
  })
}

// ─── Model Discovery ─────────────────────────────────────────────────────────

export async function discoverModels(config: {
  type: LLMProviderType
  baseUrl?: string | null
  apiKey?: string | null
}) {
  return $fetch<ModelInfo[]>('/api/settings/llm-providers/models', {
    method: 'POST',
    body: config,
  })
}

// ─── Connection Testing ──────────────────────────────────────────────────────

export async function testLLMProvider(config: {
  type: LLMProviderType
  baseUrl?: string | null
  apiKey?: string | null
  model: string
}) {
  return $fetch<TestResult>('/api/settings/llm-providers/test', {
    method: 'POST',
    body: config,
  })
}

// ─── Provider Type Metadata ──────────────────────────────────────────────────

export const PROVIDER_TYPES: Record<LLMProviderType, {
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
}
