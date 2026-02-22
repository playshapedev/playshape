import { z } from 'zod'
import { tool } from 'ai'

/**
 * Client-side tool for structured multiple-choice questions.
 *
 * No `execute` function — the LLM generates tool call args but execution
 * happens on the client. With `stopWhen`, the stream ends after the tool
 * call step so the client can render option buttons.
 *
 * Supports multiple questions in a single tool call. For multiple questions,
 * the UI displays tabs to switch between them. The user must answer all
 * questions before submitting.
 */
export const askQuestionTool = tool({
  description: 'Ask the user one or more structured multiple-choice questions. For multiple questions, the UI displays tabs to switch between them.',
  inputSchema: z.object({
    questions: z.array(z.object({
      id: z.string().describe('Unique identifier for this question (e.g., "tone", "format")'),
      label: z.string().describe('Short tab label (1-2 words, e.g., "Tone", "Format")'),
      question: z.string().describe('The full question to display'),
      options: z.array(z.object({
        label: z.string().describe('Short option label (1-5 words)'),
        description: z.string().optional().describe('Optional longer explanation of this option'),
        value: z.string().describe('The value returned when selected'),
      })).min(2).max(8).describe('Available choices'),
    })).min(1).max(6).describe('Questions to ask the user'),
  }),
})

/** Type for a single question in the ask_question tool */
export interface AskQuestionOption {
  label: string
  description?: string
  value: string
}

/** Type for a question in the ask_question tool */
export interface AskQuestion {
  id: string
  label: string
  question: string
  options: AskQuestionOption[]
}

/** Type for the ask_question tool input */
export interface AskQuestionInput {
  questions: AskQuestion[]
}
