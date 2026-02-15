import { z } from 'zod'

const discoverModelsSchema = z.object({
  type: z.enum(['ollama', 'lmstudio', 'openai', 'anthropic', 'fireworks']),
  baseUrl: z.string().url().optional().nullable(),
  apiKey: z.string().optional().nullable(),
})

interface ModelInfo {
  id: string
  name: string
  description?: string
}

/**
 * Discover available models for a given provider configuration.
 * For local providers (Ollama, LM Studio), queries the running server.
 * For cloud providers, returns a curated list of recommended models.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const config = discoverModelsSchema.parse(body)

  switch (config.type) {
    case 'ollama':
      return await discoverOllamaModels(config.baseUrl || 'http://localhost:11434')

    case 'lmstudio':
      return await discoverLMStudioModels(config.baseUrl || 'http://localhost:1234')

    case 'openai':
      return getOpenAIModels()

    case 'anthropic':
      return getAnthropicModels()

    case 'fireworks':
      return await discoverFireworksModels(config.apiKey)

    default:
      return []
  }
})

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
        model: string
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
      data: Array<{
        id: string
        object?: string
      }>
    }

    return (data.data || []).map(m => ({
      id: m.id,
      name: m.id,
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

function getOpenAIModels(): ModelInfo[] {
  return [
    { id: 'gpt-5', name: 'GPT-5', description: 'Most capable model' },
    { id: 'gpt-5-mini', name: 'GPT-5 Mini', description: 'Fast and affordable' },
    { id: 'gpt-4.1', name: 'GPT-4.1', description: 'Strong general-purpose model' },
    { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', description: 'Fast and affordable' },
    { id: 'gpt-4o', name: 'GPT-4o', description: 'Previous-gen multimodal model' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Previous-gen affordable model' },
  ]
}

function getAnthropicModels(): ModelInfo[] {
  return [
    { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', description: 'Best balance of speed and intelligence' },
    { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', description: 'Most capable model' },
    { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', description: 'Fastest and most affordable' },
    { id: 'claude-sonnet-4-0', name: 'Claude Sonnet 4', description: 'Previous-gen balanced model' },
    { id: 'claude-3-7-sonnet-latest', name: 'Claude 3.7 Sonnet', description: 'Previous-gen model' },
    { id: 'claude-3-5-haiku-latest', name: 'Claude 3.5 Haiku', description: 'Previous-gen fast model' },
  ]
}

async function discoverFireworksModels(apiKey?: string | null): Promise<ModelInfo[]> {
  if (!apiKey) {
    // Return curated list when no API key is provided yet
    return [
      { id: 'accounts/fireworks/models/llama4-maverick-instruct-basic', name: 'Llama 4 Maverick', description: 'Meta\'s most capable open model' },
      { id: 'accounts/fireworks/models/llama4-scout-instruct-basic', name: 'Llama 4 Scout', description: 'Fast and efficient open model' },
      { id: 'accounts/fireworks/models/deepseek-v3', name: 'DeepSeek V3', description: 'Strong coding and reasoning' },
      { id: 'accounts/fireworks/models/deepseek-r1', name: 'DeepSeek R1', description: 'Advanced reasoning model' },
      { id: 'accounts/fireworks/models/qwen3-235b-a22b', name: 'Qwen 3 235B', description: 'Large multilingual model' },
      { id: 'accounts/fireworks/models/llama-v3p3-70b-instruct', name: 'Llama 3.3 70B', description: 'Fast general-purpose model' },
    ]
  }

  try {
    const response = await fetch('https://api.fireworks.ai/v1/accounts/fireworks/models?pageSize=200', {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!response.ok) {
      throw createError({
        statusCode: 502,
        statusMessage: `Fireworks API returned ${response.status}: ${response.statusText}`,
      })
    }

    const data = await response.json() as {
      models: Array<{
        name: string
        displayName?: string
        description?: string
        supportsTools?: boolean
        contextLength?: number
      }>
    }

    return (data.models || [])
      .map(m => ({
        id: m.name,
        name: m.displayName || m.name.split('/').pop() || m.name,
        description: [
          m.description,
          m.contextLength ? `${Math.round(m.contextLength / 1024)}k context` : null,
          m.supportsTools ? 'tools' : null,
        ].filter(Boolean).join(' · ') || undefined,
      }))
  }
  catch (error: unknown) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error
    throw createError({
      statusCode: 502,
      statusMessage: 'Failed to fetch models from Fireworks AI. Check your API key.',
    })
  }
}
