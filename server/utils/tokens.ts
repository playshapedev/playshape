import { get_encoding } from 'tiktoken'
import type { ModelMessage } from 'ai'
import { tokenUsage, type TokenUsageEntityType } from '../database/schema'
import { useDb } from './db'

// Cache the encoder - reuse across calls for performance
// Using cl100k_base which is used by GPT-4, Claude approximations work well with this
let encoder: ReturnType<typeof get_encoding> | null = null

function getEncoder() {
  if (!encoder) {
    encoder = get_encoding('cl100k_base')
  }
  return encoder
}

/**
 * Count tokens in a string using tiktoken's cl100k_base encoding.
 * This encoding is used by GPT-4 and works as a reasonable approximation
 * for other models (Claude, etc.) with ~10% variance.
 */
export function countTokens(text: string): number {
  if (!text) return 0
  const enc = getEncoder()
  return enc.encode(text).length
}

/**
 * Count tokens for an array of ModelMessages.
 * Accounts for role tokens and message structure overhead.
 */
export function countMessagesTokens(messages: ModelMessage[]): number {
  let total = 0

  for (const msg of messages) {
    // Overhead per message: role, separators, etc.
    total += 4

    if (typeof msg.content === 'string') {
      total += countTokens(msg.content)
    }
    else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === 'text') {
          total += countTokens(part.text)
        }
        else if (part.type === 'tool-call') {
          // Tool calls: function name + input
          total += countTokens(part.toolName)
          total += countTokens(JSON.stringify(part.input))
        }
        else if (part.type === 'tool-result') {
          // Tool results: stringified output
          total += countTokens(JSON.stringify(part.output))
        }
        // Images are handled separately by providers (not counted here)
      }
    }
  }

  // Final assistant turn start overhead
  return total + 2
}

/**
 * Estimate tokens for a system prompt.
 */
export function countSystemTokens(systemPrompt: string): number {
  if (!systemPrompt) return 0
  // System prompt overhead
  return countTokens(systemPrompt) + 4
}

/**
 * Record token usage to the database.
 */
export async function recordTokenUsage(data: {
  entityType: TokenUsageEntityType
  entityId: string
  providerId?: string | null
  modelId: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  wasCompacted?: boolean
}): Promise<void> {
  const db = useDb()

  db.insert(tokenUsage).values({
    id: crypto.randomUUID(),
    entityType: data.entityType,
    entityId: data.entityId,
    providerId: data.providerId ?? null,
    modelId: data.modelId,
    promptTokens: data.promptTokens,
    completionTokens: data.completionTokens,
    totalTokens: data.totalTokens,
    wasCompacted: data.wasCompacted ?? false,
    createdAt: new Date(),
  }).run()
}

/**
 * Format a token count for display (e.g., "1.2k", "125k")
 */
export function formatTokenCount(count: number): string {
  if (count < 1000) return count.toString()
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`
  if (count < 1000000) return `${Math.round(count / 1000)}k`
  return `${(count / 1000000).toFixed(1)}M`
}
