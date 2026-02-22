import { eq, and } from 'drizzle-orm'
import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { createOllama } from 'ollama-ai-provider-v2'
import { createFireworks } from '@ai-sdk/fireworks'
import { aiProviders, aiModels, llmProviders } from '../database/schema'

type ProviderType = 'ollama' | 'lmstudio' | 'openai' | 'anthropic' | 'fireworks' | 'replicate' | 'fal' | 'together'

interface ProviderConfig {
  type: ProviderType
  baseUrl?: string | null
  apiKey?: string | null
  model: string
}

/**
 * Creates an AI SDK language model instance from a provider configuration.
 *
 * This is the core factory function used by all generation routes and the
 * connection test endpoint. It handles the provider-specific SDK initialization
 * and returns a ready-to-use model.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createLanguageModel(config: ProviderConfig): any {
  switch (config.type) {
    case 'ollama': {
      const ollama = createOllama({
        baseURL: `${config.baseUrl || 'http://localhost:11434'}/api`,
      })
      return ollama(config.model)
    }

    case 'lmstudio': {
      const lmstudio = createOpenAICompatible({
        name: 'lmstudio',
        baseURL: `${config.baseUrl || 'http://localhost:1234'}/v1`,
      })
      return lmstudio(config.model)
    }

    case 'openai': {
      if (!config.apiKey) {
        throw createError({ statusCode: 400, statusMessage: 'OpenAI API key is required' })
      }
      const openai = createOpenAI({
        apiKey: config.apiKey,
      })
      return openai(config.model)
    }

    case 'anthropic': {
      if (!config.apiKey) {
        throw createError({ statusCode: 400, statusMessage: 'Anthropic API key is required' })
      }
      const anthropic = createAnthropic({
        apiKey: config.apiKey,
      })
      return anthropic(config.model)
    }

    case 'fireworks': {
      if (!config.apiKey) {
        throw createError({ statusCode: 400, statusMessage: 'Fireworks AI API key is required' })
      }
      const fireworks = createFireworks({
        apiKey: config.apiKey,
      })
      return fireworks(config.model)
    }

    case 'together': {
      if (!config.apiKey) {
        throw createError({ statusCode: 400, statusMessage: 'Together AI API key is required' })
      }
      const together = createOpenAICompatible({
        name: 'together',
        baseURL: 'https://api.together.xyz/v1',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
        },
      })
      return together(config.model)
    }

    default:
      throw createError({ statusCode: 400, statusMessage: `Unknown provider type: ${(config as ProviderConfig).type}` })
  }
}

/**
 * Fetches the active text model from the new unified schema.
 * Falls back to the legacy llmProviders table if no new-style model is found.
 */
export function useActiveTextModel() {
  const db = useDb()

  // Try new schema first: find active text model and its provider
  const activeModel = db
    .select()
    .from(aiModels)
    .where(and(eq(aiModels.purpose, 'text'), eq(aiModels.isActive, true)))
    .get()

  if (activeModel) {
    const provider = db
      .select()
      .from(aiProviders)
      .where(eq(aiProviders.id, activeModel.providerId))
      .get()

    if (provider) {
      return {
        provider,
        model: activeModel,
        config: {
          type: provider.type as ProviderType,
          baseUrl: provider.baseUrl,
          apiKey: provider.apiKey,
          model: activeModel.modelId,
        },
      }
    }
  }

  // Fall back to legacy schema
  const legacyProvider = db
    .select()
    .from(llmProviders)
    .where(eq(llmProviders.isActive, true))
    .get()

  if (legacyProvider) {
    return {
      provider: legacyProvider,
      model: null,
      config: {
        type: legacyProvider.type as ProviderType,
        baseUrl: legacyProvider.baseUrl,
        apiKey: legacyProvider.apiKey,
        model: legacyProvider.model,
      },
    }
  }

  return null
}

/**
 * @deprecated Use useActiveTextModel() instead
 */
export function useActiveProvider() {
  const result = useActiveTextModel()
  if (!result) return null

  // Return in legacy format for backwards compatibility
  return {
    id: result.provider.id,
    type: result.config.type,
    baseUrl: result.config.baseUrl,
    apiKey: result.config.apiKey,
    model: result.config.model,
    isActive: true,
    name: result.provider.name,
    createdAt: result.provider.createdAt,
    updatedAt: result.provider.updatedAt,
  }
}

/**
 * Returns a ready-to-use AI SDK model from the active text model.
 *
 * This is the primary function generation routes should call. It:
 * 1. Fetches the active text model from the database (new or legacy schema)
 * 2. Creates the appropriate AI SDK model instance
 * 3. Throws a descriptive 409 error if no provider is configured/active
 *
 * Usage in a server route:
 * ```ts
 * const { model, provider } = useActiveModel()
 * const { text } = await generateText({ model, prompt: '...' })
 * ```
 */
export function useActiveModel() {
  const result = useActiveTextModel()

  if (!result) {
    throw createError({
      statusCode: 409,
      statusMessage: 'No active text model configured. Go to Settings > AI Providers to configure a text model.',
    })
  }

  const model = createLanguageModel(result.config)

  return { model, provider: result.provider }
}
