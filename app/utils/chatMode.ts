/**
 * Chat mode determines what tools the AI can use.
 * - 'plan': Read-only mode. AI can only gather information, ask questions, and propose changes.
 * - 'build': Full mode. AI can execute write operations (create, update, delete).
 */
export type ChatMode = 'build' | 'plan'

/**
 * Determine the initial mode based on whether the chat has existing messages.
 * New chats start in Plan mode to encourage planning first.
 * Existing chats start in Build mode to not disrupt ongoing work.
 */
export function getInitialChatMode(hasMessages: boolean): ChatMode {
  return hasMessages ? 'build' : 'plan'
}
