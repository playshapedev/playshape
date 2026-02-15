import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core'

// ─── Projects ────────────────────────────────────────────────────────────────

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').default(''),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

// ─── Skills ──────────────────────────────────────────────────────────────────

export const skills = sqliteTable('skills', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description').default(''),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

// ─── Activities ──────────────────────────────────────────────────────────────
// The `definition` column stores the activity's full structure as JSON.
// The shape varies by `type` — validated at the application layer via Zod
// discriminated unions.

export const activities = sqliteTable('activities', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  type: text('type').notNull(), // e.g. 'branching-scenario', 'role-play', 'assessment'
  description: text('description').default(''),
  definition: text('definition', { mode: 'json' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

// ─── Libraries ───────────────────────────────────────────────────────────────
// Top-level knowledge containers. Designers upload source content into
// libraries, which can then be linked to one or more projects.

export const libraries = sqliteTable('libraries', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').default(''),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

// ─── Documents ───────────────────────────────────────────────────────────────
// Source content within a library — uploaded files or pasted text. The `body`
// column stores the extracted plain text; original files are stored on disk.

export const documents = sqliteTable('documents', {
  id: text('id').primaryKey(),
  libraryId: text('library_id').notNull().references(() => libraries.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  sourceType: text('source_type').notNull(), // 'text', 'pdf', 'docx', 'pptx', 'txt'
  sourceFilename: text('source_filename'), // original filename for file uploads
  mimeType: text('mime_type'), // MIME type of the original file
  fileSize: integer('file_size'), // size in bytes
  body: text('body').notNull().default(''), // extracted plain text content
  status: text('status').notNull().default('processing'), // 'processing', 'ready', 'error'
  error: text('error'), // error message if extraction failed
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

// ─── Document Chunks ─────────────────────────────────────────────────────────
// Paragraph-level chunks of document text for embedding and semantic search.

export const documentChunks = sqliteTable('document_chunks', {
  id: text('id').primaryKey(),
  documentId: text('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
  libraryId: text('library_id').notNull().references(() => libraries.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  chunkIndex: integer('chunk_index').notNull(),
  // Embedding vector stored as JSON array of floats.
  // On desktop, also indexed in sqlite-vec virtual table for KNN search.
  embedding: text('embedding', { mode: 'json' }).$type<number[]>(),
})

// ─── Project ↔ Library (many-to-many) ────────────────────────────────────────
// Links libraries to projects so the activity generation pipeline knows which
// knowledge to pull context from.

export const projectLibraries = sqliteTable('project_libraries', {
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  libraryId: text('library_id').notNull().references(() => libraries.id, { onDelete: 'cascade' }),
  linkedAt: integer('linked_at', { mode: 'timestamp_ms' }).notNull(),
}, table => [
  primaryKey({ columns: [table.projectId, table.libraryId] }),
])

// ─── LLM Providers ───────────────────────────────────────────────────────────
// Configured LLM providers. Users can set up multiple providers (Ollama,
// LM Studio, OpenAI, Anthropic, Fireworks AI) and mark one as active for generation.
// API keys are stored here for now; will migrate to OS secure storage
// (Electron safeStorage / Capacitor Keychain) once the IPC layer is built.

/** Canonical list of supported LLM provider types. Add new providers here. */
export const LLM_PROVIDER_TYPES = ['ollama', 'lmstudio', 'openai', 'anthropic', 'fireworks'] as const
export type LLMProviderType = (typeof LLM_PROVIDER_TYPES)[number]

export const llmProviders = sqliteTable('llm_providers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(), // user-given label, e.g. "My Local Ollama"
  type: text('type').$type<LLMProviderType>().notNull(),
  baseUrl: text('base_url'), // for local providers; null uses provider default
  apiKey: text('api_key'), // for cloud providers; TODO: migrate to secure storage
  model: text('model').notNull(), // model identifier, e.g. 'llama3.2', 'gpt-5', 'claude-sonnet-4-0'
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

// ─── Templates ───────────────────────────────────────────────────────────────
// Reusable activity blueprints created through AI-assisted conversation.
// Each template has an input schema (defining form fields for parameterization)
// and a Vue 3 SFC component (the activity itself). When a designer uses a
// template, they fill in the form → produces JSON data → fed to the Vue
// component to render a complete activity.

export const templates = sqliteTable('templates', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').default(''),
  // JSON array of field definitions — supports nested array fields for structured lists
  inputSchema: text('input_schema', { mode: 'json' }).$type<TemplateField[]>(),
  // Vue 3 SFC source code as a string
  component: text('component'),
  // Realistic example data matching the input schema, used for previewing the template
  sampleData: text('sample_data', { mode: 'json' }).$type<Record<string, unknown>>(),
  // External CDN dependencies loaded in the preview iframe
  dependencies: text('dependencies', { mode: 'json' }).$type<TemplateDependency[]>(),
  // Activity tools provided by the host application (e.g. "code-editor")
  tools: text('tools', { mode: 'json' }).$type<string[]>(),
  // Chat conversation history for resuming AI-assisted editing
  messages: text('messages', { mode: 'json' }).$type<TemplateMessage[]>(),
  status: text('status').notNull().default('draft'), // 'draft' | 'published'
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

// ─── Template Types (used by JSON columns) ───────────────────────────────────

export interface TemplateDependency {
  name: string // package name, e.g. "chart.js"
  url: string // CDN URL, e.g. "https://cdn.jsdelivr.net/npm/chart.js"
  global: string // global variable name, e.g. "Chart"
}

export interface TemplateField {
  id: string
  type: 'text' | 'textarea' | 'dropdown' | 'checkbox' | 'number' | 'color' | 'array'
  label: string
  required?: boolean
  placeholder?: string
  options?: string[] // for dropdown
  default?: unknown
  min?: number // for number
  max?: number // for number
  fields?: TemplateField[] // sub-fields for array type
}

export interface TemplateMessage {
  role: 'user' | 'assistant'
  content: string
  toolInvocations?: Array<{
    toolName: string
    args: Record<string, unknown>
    result?: unknown
  }>
}

// ─── Settings ────────────────────────────────────────────────────────────────
// Key-value store for app settings. General preferences live here.

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})
