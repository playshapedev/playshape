import { Chat } from '@ai-sdk/vue'
import { DefaultChatTransport } from 'ai'
import type { UIMessage, FileUIPart, TokenUsageMetadata, InitialTokenUsage, QueuedMessage, SendMessageResult } from '~/types/chat'
import type { ChatMode } from '~/utils/chatMode'

// ─── Configuration ───────────────────────────────────────────────────────────

/** Maximum number of messages that can be queued while streaming */
const MAX_QUEUE_SIZE = 2

export interface UseChatOptions {
  /** API endpoint URL for the chat */
  apiUrl: string

  /** Additional body parameters to send with each request (can be reactive) */
  bodyParams?: () => Record<string, unknown>

  /** Endpoint to PATCH for saving messages (e.g., '/api/templates/:id') */
  saveUrl?: string

  /** Tool types that indicate an "update" action (for preview error reporting) */
  updateToolTypes?: string[]

  /** Whether this chat supports file attachments */
  supportsFiles?: boolean

  /** Whether this chat supports preview error reporting */
  supportsPreviewErrors?: boolean
}

// ─── Return Type ─────────────────────────────────────────────────────────────

export interface UseChatReturn {
  /** The underlying Chat instance from @ai-sdk/vue */
  chat: Chat<UIMessage>

  /** Send a message, optionally with file attachments. Returns status of send attempt. */
  sendMessage: (content: string, files?: FileUIPart[]) => SendMessageResult

  /** Stop the current generation */
  stopGeneration: () => Promise<void>

  /** Persist messages to the server */
  saveMessages: () => Promise<void>

  /** Report a preview error to the AI for self-correction (only if supportsPreviewErrors) */
  reportPreviewError: (error: string) => void

  /** Reactive token usage tracking */
  tokenUsage: Ref<TokenUsageMetadata>

  /** Whether the last response included an update tool call */
  lastResponseHadUpdate: Ref<boolean>

  /** Callback ref - set this to be notified when an update tool completes */
  onUpdate: Ref<(() => void) | null>

  /** Messages queued to be sent after current response completes */
  messageQueue: Ref<QueuedMessage[]>

  /** Clear all queued messages */
  clearQueue: () => void
}

// ─── Composable ──────────────────────────────────────────────────────────────

/**
 * Unified chat composable for all chat-based features.
 *
 * Creates a Chat instance with consistent behavior for:
 * - Message streaming and state management
 * - Token usage accumulation
 * - Message persistence
 * - Preview error reporting
 * - Message queuing during streaming
 *
 * @param initialMessages - Messages to hydrate the chat with
 * @param mode - Reactive ref to current chat mode ('build' or 'plan')
 * @param initialTokenUsage - Optional token counts from persisted entity data
 * @param options - Configuration options for the chat
 */
export function useChat(
  initialMessages: UIMessage[] = [],
  mode: Ref<ChatMode>,
  initialTokenUsage: InitialTokenUsage | undefined,
  options: UseChatOptions,
): UseChatReturn {
  const {
    apiUrl,
    bodyParams,
    saveUrl,
    updateToolTypes = [],
    supportsPreviewErrors = false,
  } = options

  // Callback for update notifications
  const onUpdate = ref<(() => void) | null>(null)

  // Track whether the last AI response included an update tool call
  const lastResponseHadUpdate = ref(false)

  // Token usage - tracks cumulative totals for the conversation
  const tokenUsage = ref<TokenUsageMetadata>({
    totalTokens: initialTokenUsage?.totalTokens ?? 0,
    promptTokens: initialTokenUsage?.promptTokens ?? 0,
    completionTokens: initialTokenUsage?.completionTokens ?? 0,
  })

  // Message queue - holds messages submitted while streaming
  const messageQueue = ref<QueuedMessage[]>([])

  /**
   * Actually send a message via the chat instance.
   * Internal helper - does not check status or queue.
   */
  function doSendMessage(content: string, files?: FileUIPart[]) {
    if (files && files.length > 0) {
      chat.sendMessage({ text: content, files })
    }
    else {
      chat.sendMessage({ text: content })
    }
  }

  /**
   * Process the next queued message if any.
   * Called after onFinish completes.
   */
  function processQueue() {
    if (messageQueue.value.length === 0) return

    const next = messageQueue.value.shift()!
    // Use nextTick to ensure state is settled before sending
    nextTick(() => {
      doSendMessage(next.content, next.files)
    })
  }

  // Create the Chat instance
  const chat = new Chat({
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: apiUrl,
      body: () => ({
        mode: mode.value,
        ...bodyParams?.(),
      }),
    }),
    onFinish: async ({ message }) => {
      // Check if any assistant message used an update tool
      if (updateToolTypes.length > 0) {
        lastResponseHadUpdate.value = chat.messages.some(msg =>
          msg.role === 'assistant'
          && msg.parts.some(p => updateToolTypes.includes(p.type)),
        )
      }

      // Extract and accumulate token usage from message metadata
      const metadata = message?.metadata as { tokenUsage?: TokenUsageMetadata } | undefined
      if (metadata?.tokenUsage) {
        const prev = tokenUsage.value
        const incoming = metadata.tokenUsage

        tokenUsage.value = {
          // Accumulate tokens across responses
          promptTokens: (prev.promptTokens ?? 0) + (incoming.promptTokens ?? 0),
          completionTokens: (prev.completionTokens ?? 0) + (incoming.completionTokens ?? 0),
          totalTokens: (prev.totalTokens ?? 0) + (incoming.totalTokens ?? 0),
          // Context tokens are from the latest request only
          contextTokens: incoming.contextTokens,
          // Track if any response used compaction
          wasCompacted: prev.wasCompacted || incoming.wasCompacted,
          compactionMessage: incoming.compactionMessage || prev.compactionMessage,
        }
      }

      // Persist messages
      await saveMessages()

      // Notify listeners
      onUpdate.value?.()

      // Process next queued message if any
      processQueue()
    },
    onError: (error) => {
      console.error(`[Chat ${apiUrl}] Error:`, error)
    },
  })

  // Track tool call IDs that have already triggered updates (to avoid duplicates)
  const processedToolCallIds = new Set<string>()

  // Watch for tool completions during streaming to trigger immediate updates
  // This allows generated images to appear before the LLM finishes its response
  if (updateToolTypes.length > 0) {
    watch(
      () => chat.messages,
      (messages) => {
        for (const msg of messages) {
          if (msg.role !== 'assistant') continue

          for (const part of msg.parts) {
            if (!part.type.startsWith('tool-')) continue
            if (!updateToolTypes.includes(part.type)) continue

            const toolPart = part as { toolCallId?: string; state?: string }
            if (toolPart.state !== 'output-available') continue
            if (!toolPart.toolCallId) continue
            if (processedToolCallIds.has(toolPart.toolCallId)) continue

            // This tool just completed - trigger update immediately
            processedToolCallIds.add(toolPart.toolCallId)
            onUpdate.value?.()
          }
        }
      },
      { deep: true },
    )
  }

  /**
   * Send a message from the user, optionally with file attachments.
   * If currently streaming, the message is queued (up to MAX_QUEUE_SIZE).
   *
   * @returns 'sent' if sent immediately, 'queued' if added to queue, 'queue-full' if queue is full
   */
  function sendMessage(content: string, files?: FileUIPart[]): SendMessageResult {
    // Validate content
    if (!content.trim() && (!files || files.length === 0)) {
      return 'sent' // Nothing to send, treat as success
    }

    // If streaming or submitted, queue the message
    if (chat.status === 'streaming' || chat.status === 'submitted') {
      if (messageQueue.value.length >= MAX_QUEUE_SIZE) {
        return 'queue-full'
      }

      messageQueue.value.push({
        id: crypto.randomUUID(),
        content,
        files,
      })
      return 'queued'
    }

    // Send immediately
    doSendMessage(content, files)
    return 'sent'
  }

  /**
   * Clear all queued messages.
   */
  function clearQueue() {
    messageQueue.value = []
  }

  /**
   * Report a preview error back to the AI so it can self-correct.
   * Only sends if supportsPreviewErrors is enabled and the last response
   * included an update tool call.
   */
  function reportPreviewError(error: string) {
    if (!supportsPreviewErrors) return
    if (!lastResponseHadUpdate.value) return
    if (chat.status !== 'ready') return

    // Clear the flag so we don't report the same error repeatedly
    lastResponseHadUpdate.value = false

    sendMessage(`[Preview Error] The component failed to render with this error:\n\n${error}\n\nPlease fix the issue.`)
  }

  /**
   * Persist the current conversation to the entity's messages column.
   */
  async function saveMessages() {
    if (!saveUrl) return

    try {
      await $fetch(saveUrl, {
        method: 'PATCH',
        body: { messages: chat.messages },
      })
    }
    catch {
      // Non-critical - messages are still in memory
    }
  }

  /**
   * Stop the current generation immediately.
   */
  async function stopGeneration() {
    if (chat.status !== 'streaming' && chat.status !== 'submitted') return
    await chat.stop()
    await saveMessages()
  }

  return {
    chat,
    sendMessage,
    stopGeneration,
    saveMessages,
    reportPreviewError,
    tokenUsage,
    lastResponseHadUpdate,
    onUpdate,
    messageQueue,
    clearQueue,
  }
}
