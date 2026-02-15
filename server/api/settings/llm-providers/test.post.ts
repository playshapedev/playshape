import { z } from 'zod'
import { generateText } from 'ai'

const testProviderSchema = z.object({
  type: z.enum(['ollama', 'lmstudio', 'openai', 'anthropic', 'fireworks']),
  baseUrl: z.string().url().optional().nullable(),
  apiKey: z.string().optional().nullable(),
  model: z.string().min(1, 'Model is required'),
})

/**
 * Test an LLM provider configuration by making a small generation call.
 * Accepts ad-hoc config (doesn't need to be saved first).
 * Returns { ok: true } on success, or throws with a descriptive error.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const config = testProviderSchema.parse(body)

  const model = createLanguageModel(config)

  try {
    const { text } = await generateText({
      model,
      prompt: 'Respond with exactly: OK',
      maxOutputTokens: 10,
    })

    return {
      ok: true,
      response: text.trim().substring(0, 100),
    }
  }
  catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)

    // Provide actionable error messages per provider type
    if (message.includes('ECONNREFUSED') || message.includes('fetch failed')) {
      const serverName = config.type === 'ollama' ? 'Ollama' : 'LM Studio'
      throw createError({
        statusCode: 502,
        statusMessage: `Cannot connect to ${serverName}. Make sure the server is running.`,
      })
    }

    if (message.includes('401') || message.includes('Unauthorized') || message.includes('invalid_api_key')) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Invalid API key. Please check your key and try again.',
      })
    }

    if (message.includes('404') || message.includes('model_not_found') || message.includes('not found')) {
      throw createError({
        statusCode: 404,
        statusMessage: `Model "${config.model}" not found. Check the model name or download it first.`,
      })
    }

    throw createError({
      statusCode: 502,
      statusMessage: `Connection test failed: ${message}`,
    })
  }
})
