import { generateText, convertToModelMessages } from 'ai'
import type { UIMessage, ModelMessage } from 'ai'
import { countTokens, countMessagesTokens, countSystemTokens } from './tokens'

/**
 * Configuration for context compaction behavior.
 */
export interface CompactionConfig {
  /** Maximum context window size in tokens (default: 200k) */
  maxContextTokens: number
  /** Tokens reserved for the model's response (default: 15% of max = 30k) */
  reserveTokens: number
  /** Maximum tokens for the summary (default: 10% of max = 20k) */
  summaryMaxTokens: number
  /** Always keep at least this many recent messages (default: 4) */
  minMessagesToKeep: number
}

const DEFAULT_CONFIG: CompactionConfig = {
  maxContextTokens: 200000,
  reserveTokens: 30000,
  summaryMaxTokens: 20000,
  minMessagesToKeep: 4,
}

/**
 * Result of a compaction operation.
 */
export interface CompactionResult {
  /** Messages to send to the LLM (may include summary) */
  messages: ModelMessage[]
  /** Whether compaction was performed */
  wasCompacted: boolean
  /** Original token count (system + messages) */
  originalTokens: number
  /** Token count after compaction */
  compactedTokens: number
  /** Number of messages that were summarized */
  summarizedMessageCount: number
  /** User-friendly message about compaction (shown in chat UI) */
  compactionMessage?: string
}

/**
 * Compacts a conversation context to fit within token limits.
 *
 * When the conversation exceeds the available token budget, this function:
 * 1. Keeps the N most recent messages (configured by minMessagesToKeep)
 * 2. Summarizes all older messages into a single context summary
 * 3. Prepends the summary as a system message
 *
 * The full message history is preserved in the database - only the context
 * sent to the LLM is modified.
 *
 * @param uiMessages - The full conversation history from the UI
 * @param systemPrompt - The system prompt for the conversation
 * @param model - The AI SDK model to use for summarization
 * @param config - Optional configuration overrides
 */
export async function compactContext(
  uiMessages: UIMessage[],
  systemPrompt: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: any,
  config: Partial<CompactionConfig> = {},
): Promise<CompactionResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config }

  // Convert to model messages for counting
  const modelMessages = await convertToModelMessages(uiMessages)

  // Count current tokens (system + messages)
  const systemTokens = countSystemTokens(systemPrompt)
  const messagesTokens = countMessagesTokens(modelMessages)
  const totalTokens = systemTokens + messagesTokens

  const availableTokens = cfg.maxContextTokens - cfg.reserveTokens

  // If within limits, no compaction needed
  if (totalTokens <= availableTokens) {
    return {
      messages: modelMessages,
      wasCompacted: false,
      originalTokens: totalTokens,
      compactedTokens: totalTokens,
      summarizedMessageCount: 0,
    }
  }

  // Need to compact - find how many messages to summarize
  // Keep last N messages, summarize the rest
  const messagesToKeep = Math.max(cfg.minMessagesToKeep, 2)

  if (modelMessages.length <= messagesToKeep) {
    // Can't compact further - conversation too short but still too large
    // This could happen with very long individual messages
    console.warn(`[contextCompaction] Cannot compact: only ${modelMessages.length} messages but ${totalTokens} tokens`)
    return {
      messages: modelMessages,
      wasCompacted: false,
      originalTokens: totalTokens,
      compactedTokens: totalTokens,
      summarizedMessageCount: 0,
    }
  }

  const recentMessages = modelMessages.slice(-messagesToKeep)
  const oldMessages = modelMessages.slice(0, -messagesToKeep)

  console.log(`[contextCompaction] Compacting ${oldMessages.length} messages (keeping ${recentMessages.length} recent)`)

  // Generate summary of old messages
  const summary = await generateConversationSummary(oldMessages, model, cfg.summaryMaxTokens)

  // Create summary message as a system message
  const summaryMessage: ModelMessage = {
    role: 'system',
    content: `[Previous conversation summary]\n${summary}`,
  }

  const compactedMessages = [summaryMessage, ...recentMessages]
  const compactedTokens = systemTokens + countMessagesTokens(compactedMessages)

  console.log(`[contextCompaction] Reduced from ${totalTokens} to ${compactedTokens} tokens`)

  return {
    messages: compactedMessages,
    wasCompacted: true,
    originalTokens: totalTokens,
    compactedTokens,
    summarizedMessageCount: oldMessages.length,
    compactionMessage: `Conversation history summarized (${oldMessages.length} earlier messages) to continue within context limits.`,
  }
}

/**
 * Generates a comprehensive summary of a conversation segment.
 *
 * The summary preserves:
 * - Key decisions and conclusions
 * - Important information shared
 * - Current state and progress
 * - Tool calls and their results
 * - Pending actions or questions
 */
async function generateConversationSummary(
  messages: ModelMessage[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: any,
  maxTokens: number,
): Promise<string> {
  // Format messages for the summary prompt
  const conversationText = formatMessagesForSummary(messages)

  const result = await generateText({
    model,
    system: `You are summarizing a conversation for context continuity. Create a comprehensive summary that preserves:

1. **Key Decisions**: Any choices made, options selected, or directions confirmed
2. **Important Information**: Facts, requirements, constraints, or specifications shared
3. **Current State**: What has been built, created, or accomplished so far
4. **Tool Results**: Important outputs from tool calls (template updates, data changes, etc.)
5. **Pending Items**: Open questions, next steps, or incomplete actions

Be thorough but concise. Focus on information the AI will need to continue the conversation effectively.
Do NOT include greetings, small talk, or meta-commentary about the summary itself.
Write in a factual, informative style.`,
    prompt: `Summarize this conversation:\n\n${conversationText}`,
    maxOutputTokens: maxTokens,
  })

  return result.text
}

/**
 * Formats ModelMessages into a readable text format for summarization.
 */
function formatMessagesForSummary(messages: ModelMessage[]): string {
  const parts: string[] = []

  for (const msg of messages) {
    const role = msg.role.toUpperCase()

    if (typeof msg.content === 'string') {
      parts.push(`${role}: ${msg.content}`)
    }
    else if (Array.isArray(msg.content)) {
      const contentParts: string[] = []

      for (const part of msg.content) {
        if (part.type === 'text') {
          contentParts.push(part.text)
        }
        else if (part.type === 'tool-call') {
          contentParts.push(`[Tool Call: ${part.toolName}(${JSON.stringify(part.input)})]`)
        }
        else if (part.type === 'tool-result') {
          // Truncate very long tool results
          const outputStr = JSON.stringify(part.output)
          const truncated = outputStr.length > 2000
            ? outputStr.slice(0, 2000) + '... [truncated]'
            : outputStr
          contentParts.push(`[Tool Result: ${part.toolName} -> ${truncated}]`)
        }
      }

      if (contentParts.length > 0) {
        parts.push(`${role}: ${contentParts.join('\n')}`)
      }
    }
  }

  return parts.join('\n\n')
}

/**
 * Estimates whether a conversation will need compaction.
 * Useful for UI indicators before actually performing compaction.
 */
export async function estimateCompactionNeeded(
  uiMessages: UIMessage[],
  systemPrompt: string,
  config: Partial<CompactionConfig> = {},
): Promise<{ needed: boolean, currentTokens: number, availableTokens: number }> {
  const cfg = { ...DEFAULT_CONFIG, ...config }

  const modelMessages = await convertToModelMessages(uiMessages)
  const systemTokens = countSystemTokens(systemPrompt)
  const messagesTokens = countMessagesTokens(modelMessages)
  const currentTokens = systemTokens + messagesTokens
  const availableTokens = cfg.maxContextTokens - cfg.reserveTokens

  return {
    needed: currentTokens > availableTokens,
    currentTokens,
    availableTokens,
  }
}
