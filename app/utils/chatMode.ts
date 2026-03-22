/**
 * Chat mode determines what tools the AI can use.
 * - 'plan': Read-only mode. AI can only gather information, ask questions, and propose changes.
 * - 'build': Full mode. AI can execute write operations (create, update, delete).
 */

// Re-export from lib/ for backward compatibility
export { getInitialChatMode, type ChatMode } from '../../lib/chatMode'
