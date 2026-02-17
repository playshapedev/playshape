import { generateObject } from 'ai'
import { z } from 'zod'
import { useActiveModel } from './llm'

interface StructuredOutputOptions<T extends z.ZodObject<z.ZodRawShape>> {
  schema: T
  system: string
  prompt: string
  maxTokens?: number
}

/**
 * Generates structured output from the active LLM provider using AI SDK's generateObject.
 *
 * @returns The parsed and validated object matching the schema
 */
export async function generateStructuredOutput<T extends z.ZodObject<z.ZodRawShape>>(
  options: StructuredOutputOptions<T>,
): Promise<z.infer<T>> {
  const { model } = useActiveModel()

  const { object } = await generateObject({
    model,
    system: options.system,
    prompt: options.prompt,
    schema: options.schema,
    maxOutputTokens: options.maxTokens,
  })

  return object as z.infer<T>
}
