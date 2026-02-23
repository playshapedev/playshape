/**
 * Re-export AI SDK types used across chat composables and components.
 * Centralized here to avoid duplicate auto-import warnings.
 */
import type { UIMessage as UIMessageType, FileUIPart as FileUIPartType } from 'ai'

export type UIMessage = UIMessageType
export type FileUIPart = FileUIPartType

// ─── Token Usage ─────────────────────────────────────────────────────────────

/** Token usage metadata sent from the server with each response */
export interface TokenUsageMetadata {
  /** Tokens in the current request context (system prompt + messages) */
  contextTokens?: number
  /** Cumulative prompt tokens used across all requests */
  promptTokens?: number
  /** Cumulative completion tokens used across all requests */
  completionTokens?: number
  /** Cumulative total tokens (prompt + completion) */
  totalTokens?: number
  /** Whether context compaction was applied */
  wasCompacted?: boolean
  /** Message shown to user when context was compacted */
  compactionMessage?: string
}

/** Initial token usage values to hydrate from persisted entity data */
export interface InitialTokenUsage {
  totalTokens?: number
  promptTokens?: number
  completionTokens?: number
}

// ─── Tool Indicators ─────────────────────────────────────────────────────────

/**
 * Tool indicator configuration: maps tool part types to their display info.
 * Each entry defines what to show while a tool is running and when it completes.
 */
export interface ToolIndicator {
  /** Label shown while the tool is executing */
  loadingLabel: string | ((input: Record<string, unknown>) => string)
  /** Label shown when execution completes successfully. Return undefined for silent completion. */
  doneLabel?: string | ((input: Record<string, unknown>, output: Record<string, unknown>) => string | undefined)
  /** Icon shown on completion (defaults to check-circle) */
  doneIcon?: string
  /** Whether to show the failure state with retry messaging */
  showFailure?: boolean
  /** Label shown on failure */
  failLabel?: string
}

// ─── Multi-Question UI ───────────────────────────────────────────────────────

/** State for pending questions from the ask_question tool */
export interface PendingQuestions {
  toolCallId: string
  questions: AskQuestion[]
}

/** Single question from ask_question tool input */
export interface AskQuestion {
  id: string
  question: string
  label: string
  options: AskQuestionOption[]
}

/** Option within a question */
export interface AskQuestionOption {
  label: string
  value: string
  description?: string
}

// ─── Message Queue ───────────────────────────────────────────────────────────

/** A message waiting in the queue to be sent */
export interface QueuedMessage {
  /** Unique ID for UI key */
  id: string
  /** Message text content */
  content: string
  /** Optional file attachments */
  files?: FileUIPart[]
}

/** Result of attempting to send a message */
export type SendMessageResult = 'sent' | 'queued' | 'queue-full'
