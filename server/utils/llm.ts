import { eq } from 'drizzle-orm'
import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { createOllama } from 'ollama-ai-provider-v2'
import { createFireworks } from '@ai-sdk/fireworks'
import { llmProviders } from '../database/schema'

type ProviderType = 'ollama' | 'lmstudio' | 'openai' | 'anthropic' | 'fireworks'

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

    default:
      throw createError({ statusCode: 400, statusMessage: `Unknown provider type: ${(config as ProviderConfig).type}` })
  }
}

/**
 * Fetches the active LLM provider from the database.
 *
 * Returns the full provider row or `null` if no provider is marked active.
 * Use `useActiveModel()` instead if you need a ready-to-use AI SDK model.
 */
export function useActiveProvider() {
  const db = useDb()
  const provider = db
    .select()
    .from(llmProviders)
    .where(eq(llmProviders.isActive, true))
    .get()

  return provider ?? null
}

/**
 * Returns a ready-to-use AI SDK model from the active LLM provider.
 *
 * This is the primary function generation routes should call. It:
 * 1. Fetches the active provider from the database
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
  const provider = useActiveProvider()

  if (!provider) {
    throw createError({
      statusCode: 409,
      statusMessage: 'No active LLM provider configured. Go to Settings to add and activate a provider.',
    })
  }

  const model = createLanguageModel({
    type: provider.type as ProviderType,
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
    model: provider.model,
  })

  return { model, provider }
}
