/**
 * CourseAPI — the abstraction layer between Playshape activities and
 * learning record stores (SCORM 1.2, SCORM 2004, xAPI, or preview/console).
 *
 * Every activity MUST call `complete()` or `fail()` at some point.
 * For non-interactive content (e.g. a simple information page), call
 * `complete()` immediately on mount.
 *
 * The CourseAPI is always available in the preview iframe as `window.CourseAPI`.
 * Activities should never need to detect which backing store is in use —
 * the interface is the same regardless of export format.
 */

// ─── Statement (xAPI-like interaction record) ────────────────────────────────

/**
 * A learner interaction record, inspired by xAPI's Actor-Verb-Object model
 * but simplified for learning activity use. The actor is always the current
 * learner (injected by the backing store), so it's omitted here.
 *
 * These get stored as-is for xAPI export and converted to SCORM
 * `cmi.interactions` entries for SCORM export.
 */
export interface Statement {
  /** What the learner did. Use standard verbs when possible. */
  verb:
    | 'answered' // responded to a question
    | 'chose' // made a choice (branching, selection)
    | 'attempted' // tried something (may not have a right/wrong)
    | 'experienced' // viewed or encountered content
    | 'matched' // completed a matching exercise
    | 'sequenced' // put items in order
    | 'rated' // provided a rating
    | 'commented' // provided free-text feedback
    | (string & {}) // extensible — any custom verb

  /** What they interacted with. */
  object: {
    /** Unique ID within this activity (e.g. "question-3", "branch-2a") */
    id: string
    /** Human-readable label (e.g. "What is CPR?") */
    name?: string
    /** Category of the object (e.g. "question", "branch", "scene", "drag-drop") */
    type?: string
  }

  /** The outcome of the interaction. */
  result?: {
    /** The learner's raw response (e.g. "B", "Paris", "2,3,1") */
    response?: string
    /** Was the response correct? */
    correct?: boolean
    /** Score for this individual interaction, 0–1 */
    score?: number
    /** Time spent on this interaction in seconds */
    duration?: number
    /** Arbitrary additional data */
    extensions?: Record<string, unknown>
  }

  /** Unix timestamp in milliseconds. Auto-filled if omitted. */
  timestamp?: number
}

// ─── CourseAPI Interface ─────────────────────────────────────────────────────

export interface CourseAPI {
  // ─── Lifecycle ───────────────────────────────────────────────────────────
  /** Initialize the connection to the backing store. Call once on mount. */
  initialize(): void
  /** Terminate the connection. Call once on unmount / activity end. */
  terminate(): void

  // ─── Completion (REQUIRED — every activity must call exactly one) ────────
  /** Mark the activity as successfully completed. Triggers immediate flush. */
  complete(options?: { score?: number }): void
  /** Mark the activity as failed. Triggers immediate flush. */
  fail(options?: { score?: number }): void

  // ─── Progress ────────────────────────────────────────────────────────────
  /** Report progress as a value between 0 and 1 (e.g. 3/10 = 0.3). */
  setProgress(value: number): void

  // ─── Bookmarking ─────────────────────────────────────────────────────────
  /** Save a bookmark string (e.g. current step/question index). */
  setLocation(location: string): void
  /** Retrieve the previously saved bookmark, or null if none. */
  getLocation(): string | null

  // ─── Suspend Data (JSON state persistence) ───────────────────────────────
  /** Save arbitrary JSON-serializable state for later resume. */
  suspend(data: unknown): void
  /** Restore previously suspended state. Returns null if none exists. */
  restore<T = unknown>(): T | null

  // ─── Statements (xAPI-like interaction tracking) ─────────────────────────
  /** Record a learner interaction. Statements are flushed periodically. */
  record(statement: Statement): void
}
