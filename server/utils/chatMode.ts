/**
 * Chat mode type (mirrored from app/utils/chatMode.ts for server-side use).
 */
export type ChatMode = 'build' | 'plan'

/**
 * Instruction appended to the system prompt when the user is in Plan mode.
 * This tells the AI it can only use read-only tools.
 */
export const PLAN_MODE_INSTRUCTION = `
**PLAN MODE ACTIVE**

You are currently in Plan mode. In this mode:
- You can ONLY use read-only tools to gather information (get_*, search_*, fetch_*, ask_question)
- You CANNOT use any write, update, or create tools — they are not available to you
- Focus on:
  1. Understanding the current state by reading existing content
  2. Asking clarifying questions about requirements
  3. Proposing a detailed plan for what changes to make
  4. Explaining trade-offs and alternatives

When the user is ready to execute, they will switch to Build mode (press Tab).
`
