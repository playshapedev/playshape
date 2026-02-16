import { z } from 'zod'
import { tool } from 'ai'

/**
 * Client-side tool for structured multiple-choice questions.
 *
 * No `execute` function — the LLM generates tool call args but execution
 * happens on the client. With `stopWhen`, the stream ends after the tool
 * call step so the client can render option buttons.
 */
export const askQuestionTool = tool({
  description: 'Ask the user a structured multiple-choice question. The UI will display buttons for each option.',
  inputSchema: z.object({
    question: z.string().describe('The question to ask the user'),
    options: z.array(z.object({
      label: z.string().describe('Short button label (1-5 words)'),
      value: z.string().describe('The value to return when selected'),
    })).min(2).max(8).describe('Available choices'),
  }),
})
