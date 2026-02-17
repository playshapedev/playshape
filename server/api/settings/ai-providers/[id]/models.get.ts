import { eq } from 'drizzle-orm'
import { aiProviders } from '~~/server/database/schema'

interface ModelInfo {
  id: string
  name: string
  description?: string
  purpose: 'text' | 'image'
}

/**
 * Discover available models for a configured provider.
 * For local providers (Ollama, LM Studio), queries the running server.
 * For cloud providers with API support, fetches from their API.
 * Falls back to curated lists when API discovery isn't available.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Provider ID is required' })
  }

  const db = useDb()
  const provider = db.select().from(aiProviders).where(eq(aiProviders.id, id)).get()

  if (!provider) {
    throw createError({ statusCode: 404, statusMessage: 'Provider not found' })
  }

  switch (provider.type) {
    case 'ollama':
      return await discoverOllamaModels(provider.baseUrl || 'http://localhost:11434')

    case 'lmstudio':
      return await discoverLMStudioModels(provider.baseUrl || 'http://localhost:1234')

    case 'openai':
      return provider.apiKey
        ? await discoverOpenAIModels(provider.apiKey)
        : getOpenAIModelsFallback()

    case 'anthropic':
      return getAnthropicModels()

    case 'fireworks':
      return provider.apiKey
        ? await discoverFireworksModels(provider.apiKey)
        : getFireworksModelsFallback()

    case 'replicate':
      return getReplicateModels()

    case 'fal':
      return getFalModels()

    default:
      return []
  }
})

// ─── Ollama ──────────────────────────────────────────────────────────────────

async function discoverOllamaModels(baseUrl: string): Promise<ModelInfo[]> {
  try {
    const response = await fetch(`${baseUrl}/api/tags`)
    if (!response.ok) {
      throw createError({
        statusCode: 502,
        statusMessage: `Ollama returned ${response.status}: ${response.statusText}`,
      })
    }

    const data = await response.json() as {
      models: Array<{
        name: string
        details?: {
          family?: string
          parameter_size?: string
          quantization_level?: string
        }
      }>
    }

    return (data.models || []).map(m => ({
      id: m.name,
      name: m.name,
      description: m.details
        ? [m.details.parameter_size, m.details.family, m.details.quantization_level].filter(Boolean).join(' / ')
        : undefined,
      purpose: 'text' as const,
    }))
  }
  catch (error: unknown) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error
    throw createError({
      statusCode: 502,
      statusMessage: `Cannot connect to Ollama at ${baseUrl}. Is it running?`,
    })
  }
}

// ─── LM Studio ───────────────────────────────────────────────────────────────

async function discoverLMStudioModels(baseUrl: string): Promise<ModelInfo[]> {
  try {
    const response = await fetch(`${baseUrl}/v1/models`)
    if (!response.ok) {
      throw createError({
        statusCode: 502,
        statusMessage: `LM Studio returned ${response.status}: ${response.statusText}`,
      })
    }

    const data = await response.json() as {
      data: Array<{ id: string }>
    }

    return (data.data || []).map(m => ({
      id: m.id,
      name: m.id,
      purpose: 'text' as const,
    }))
  }
  catch (error: unknown) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error
    throw createError({
      statusCode: 502,
      statusMessage: `Cannot connect to LM Studio at ${baseUrl}. Is the server running?`,
    })
  }
}

// ─── OpenAI ──────────────────────────────────────────────────────────────────

async function discoverOpenAIModels(apiKey: string): Promise<ModelInfo[]> {
  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!response.ok) {
      // Fall back to curated list on API error
      return getOpenAIModelsFallback()
    }

    const data = await response.json() as {
      data: Array<{ id: string; owned_by?: string }>
    }

    // Filter to relevant models and categorize
    const textModels = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo', 'o1', 'o1-mini', 'o3-mini']
    const imageModels = ['dall-e-3', 'dall-e-2', 'gpt-image-1']

    const models: ModelInfo[] = []

    for (const m of data.data || []) {
      if (textModels.some(tm => m.id.startsWith(tm))) {
        models.push({ id: m.id, name: m.id, purpose: 'text' })
      }
      else if (imageModels.some(im => m.id.startsWith(im))) {
        models.push({ id: m.id, name: m.id, purpose: 'image' })
      }
    }

    // Sort and dedupe (prefer shorter IDs like 'gpt-4o' over 'gpt-4o-2024-...')
    return models.sort((a, b) => a.id.length - b.id.length)
  }
  catch {
    return getOpenAIModelsFallback()
  }
}

function getOpenAIModelsFallback(): ModelInfo[] {
  return [
    { id: 'gpt-4o', name: 'GPT-4o', description: 'Most capable model', purpose: 'text' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Fast and affordable', purpose: 'text' },
    { id: 'o1', name: 'o1', description: 'Advanced reasoning', purpose: 'text' },
    { id: 'o3-mini', name: 'o3 Mini', description: 'Fast reasoning', purpose: 'text' },
    { id: 'dall-e-3', name: 'DALL-E 3', description: 'High quality images', purpose: 'image' },
    { id: 'gpt-image-1', name: 'GPT Image 1', description: 'Native GPT-4o images', purpose: 'image' },
  ]
}

// ─── Anthropic ───────────────────────────────────────────────────────────────

function getAnthropicModels(): ModelInfo[] {
  // Anthropic doesn't have a public models API, use curated list
  return [
    { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', description: 'Best balance of speed and intelligence', purpose: 'text' },
    { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', description: 'Most capable', purpose: 'text' },
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', description: 'Previous generation', purpose: 'text' },
    { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', description: 'Fast and affordable', purpose: 'text' },
  ]
}

// ─── Fireworks ───────────────────────────────────────────────────────────────

async function discoverFireworksModels(apiKey: string): Promise<ModelInfo[]> {
  try {
    const response = await fetch('https://api.fireworks.ai/v1/accounts/fireworks/models?pageSize=200', {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!response.ok) {
      return getFireworksModelsFallback()
    }

    const data = await response.json() as {
      models: Array<{
        name: string
        displayName?: string
        description?: string
        supportsTools?: boolean
        contextLength?: number
        supportedOutputModalities?: string[]
      }>
    }

    return (data.models || []).map((m) => {
      // Determine purpose based on output modalities or model name
      const isImageModel = m.supportedOutputModalities?.includes('IMAGE')
        || m.name.includes('flux')
        || m.name.includes('stable-diffusion')
        || m.name.includes('imagen')

      return {
        id: m.name,
        name: m.displayName || m.name.split('/').pop() || m.name,
        description: [
          m.description,
          m.contextLength ? `${Math.round(m.contextLength / 1024)}k context` : null,
          m.supportsTools ? 'tools' : null,
        ].filter(Boolean).join(' · ') || undefined,
        purpose: isImageModel ? 'image' as const : 'text' as const,
      }
    })
  }
  catch {
    return getFireworksModelsFallback()
  }
}

function getFireworksModelsFallback(): ModelInfo[] {
  return [
    { id: 'accounts/fireworks/models/llama4-maverick-instruct-basic', name: 'Llama 4 Maverick', description: 'Most capable open model', purpose: 'text' },
    { id: 'accounts/fireworks/models/llama4-scout-instruct-basic', name: 'Llama 4 Scout', description: 'Fast and efficient', purpose: 'text' },
    { id: 'accounts/fireworks/models/deepseek-v3', name: 'DeepSeek V3', description: 'Strong coding and reasoning', purpose: 'text' },
    { id: 'accounts/fireworks/models/qwen3-235b-a22b', name: 'Qwen 3 235B', description: 'Large multilingual model', purpose: 'text' },
    { id: 'accounts/fireworks/models/flux-kontext-pro', name: 'FLUX Kontext Pro', description: 'High quality image editing', purpose: 'image' },
    { id: 'accounts/fireworks/models/flux-kontext-max', name: 'FLUX Kontext Max', description: 'Maximum quality images', purpose: 'image' },
  ]
}

// ─── Replicate ───────────────────────────────────────────────────────────────

function getReplicateModels(): ModelInfo[] {
  // Replicate has an API but it's complex (versions, etc). Use curated list.
  return [
    { id: 'black-forest-labs/flux-1.1-pro', name: 'FLUX 1.1 Pro', description: 'High quality, fast', purpose: 'image' },
    { id: 'black-forest-labs/flux-schnell', name: 'FLUX Schnell', description: 'Fastest FLUX', purpose: 'image' },
    { id: 'black-forest-labs/flux-dev', name: 'FLUX Dev', description: 'Development model', purpose: 'image' },
    { id: 'stability-ai/sdxl', name: 'SDXL', description: 'Stable Diffusion XL', purpose: 'image' },
    { id: 'meta/llama-3.2-90b-vision-instruct', name: 'Llama 3.2 90B Vision', description: 'Multimodal model', purpose: 'text' },
  ]
}

// ─── fal.ai ──────────────────────────────────────────────────────────────────

function getFalModels(): ModelInfo[] {
  return [
    { id: 'fal-ai/flux-pro/v1.1', name: 'FLUX Pro 1.1', description: 'High quality', purpose: 'image' },
    { id: 'fal-ai/flux/schnell', name: 'FLUX Schnell', description: 'Fast generation', purpose: 'image' },
    { id: 'fal-ai/flux/dev', name: 'FLUX Dev', description: 'Development model', purpose: 'image' },
    { id: 'fal-ai/flux-realism', name: 'FLUX Realism', description: 'Photorealistic images', purpose: 'image' },
  ]
}
