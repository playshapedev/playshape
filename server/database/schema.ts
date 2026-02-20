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

// ─── Courses ─────────────────────────────────────────────────────────────────
// A course groups activities into a deliverable learning experience within a
// project. Each course can optionally reference an interface template that
// provides the navigation wrapper (branding, lesson nav, SCORM/xAPI hooks).

export const courses = sqliteTable('courses', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  templateId: text('template_id').references(() => templates.id, { onDelete: 'set null' }),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

// ─── Course Sections ─────────────────────────────────────────────────────────
// Sections group activities within a course. Every course has at least one
// section (created automatically). When there is only one section, its title
// is null and the section UI is hidden — activities appear as a flat list.

export const courseSections = sqliteTable('course_sections', {
  id: text('id').primaryKey(),
  courseId: text('course_id').notNull().references(() => courses.id, { onDelete: 'cascade' }),
  title: text('title'), // null for the default (only) section
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

// ─── Activities ──────────────────────────────────────────────────────────────
// Each activity belongs to a course section and is backed by an activity
// template (which provides the Vue component and input field definitions).
// The `data` column stores the filled-in field values for this specific
// activity instance. The `messages` column persists the AI chat history.

export const activities = sqliteTable('activities', {
  id: text('id').primaryKey(),
  sectionId: text('section_id').notNull().references(() => courseSections.id, { onDelete: 'cascade' }),
  templateId: text('template_id').notNull().references(() => templates.id, { onDelete: 'restrict' }),
  name: text('name').notNull(),
  description: text('description').default(''),
  data: text('data', { mode: 'json' }).$type<Record<string, unknown>>(),
  messages: text('messages', { mode: 'json' }).$type<TemplateMessage[]>(),
  sortOrder: integer('sort_order').notNull().default(0),
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
  summary: text('summary'), // AI-generated summary of the document content
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

// ─── AI Providers ────────────────────────────────────────────────────────────
// Configured AI providers. Each provider type (Ollama, OpenAI, Fireworks, etc.)
// has one entry storing the API key and base URL. Models are stored separately
// in aiModels table, allowing multiple models per provider with one API key.

/** Canonical list of supported AI provider types. Add new providers here. */
export const AI_PROVIDER_TYPES = ['ollama', 'lmstudio', 'openai', 'anthropic', 'fireworks', 'replicate', 'fal'] as const
export type AIProviderType = (typeof AI_PROVIDER_TYPES)[number]

export const aiProviders = sqliteTable('ai_providers', {
  id: text('id').primaryKey(),
  type: text('type').$type<AIProviderType>().notNull().unique(), // one row per provider type
  name: text('name').notNull(), // user-given label, e.g. "My Fireworks Account"
  baseUrl: text('base_url'), // for local providers; null uses provider default
  apiKey: text('api_key'), // for cloud providers; TODO: migrate to secure storage
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

// ─── AI Models ───────────────────────────────────────────────────────────────
// Enabled models under each provider. Each model has a purpose (text or image)
// and one model per purpose can be marked active for generation.

/** Model purpose - text generation (LLM) or image generation */
export const AI_MODEL_PURPOSES = ['text', 'image'] as const
export type AIModelPurpose = (typeof AI_MODEL_PURPOSES)[number]

export const aiModels = sqliteTable('ai_models', {
  id: text('id').primaryKey(),
  providerId: text('provider_id').notNull().references(() => aiProviders.id, { onDelete: 'cascade' }),
  modelId: text('model_id').notNull(), // model identifier, e.g. 'gpt-4o', 'flux-kontext-pro'
  name: text('name').notNull(), // display name, e.g. 'GPT-4o', 'FLUX Kontext Pro'
  purpose: text('purpose').$type<AIModelPurpose>().notNull(), // 'text' or 'image'
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(false), // one active per purpose
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

// ─── Legacy Tables (to be migrated) ──────────────────────────────────────────
// These tables are kept for backwards compatibility during migration.
// TODO: Remove after data migration is complete.

/** @deprecated Use AI_PROVIDER_TYPES instead */
export const LLM_PROVIDER_TYPES = ['ollama', 'lmstudio', 'openai', 'anthropic', 'fireworks'] as const
/** @deprecated Use AIProviderType instead */
export type LLMProviderType = (typeof LLM_PROVIDER_TYPES)[number]

/** @deprecated Use aiProviders and aiModels instead */
export const llmProviders = sqliteTable('llm_providers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').$type<LLMProviderType>().notNull(),
  baseUrl: text('base_url'),
  apiKey: text('api_key'),
  model: text('model').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

/** @deprecated Use AI_PROVIDER_TYPES instead */
export const IMAGE_PROVIDER_TYPES = ['openai', 'replicate', 'fal', 'fireworks'] as const
/** @deprecated Use AIProviderType instead */
export type ImageProviderType = (typeof IMAGE_PROVIDER_TYPES)[number]

/** @deprecated Use aiProviders and aiModels instead */
export const imageProviders = sqliteTable('image_providers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').$type<ImageProviderType>().notNull(),
  apiKey: text('api_key'),
  model: text('model').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

// ─── Templates ───────────────────────────────────────────────────────────────
// Reusable blueprints created through AI-assisted conversation.
// Two kinds:
//   - 'activity': a practice activity (quiz, branching scenario, role-play, etc.)
//   - 'interface': a course navigation wrapper (branding, lesson nav, SCORM/xAPI)
//
// Each template has an input schema (defining form fields for parameterization)
// and a Vue 3 SFC component. Interface templates include a <slot name="activity">
// where activity content is rendered.

/** Canonical list of template kinds. */
export const TEMPLATE_KINDS = ['activity', 'interface'] as const
export type TemplateKind = (typeof TEMPLATE_KINDS)[number]

export const templates = sqliteTable('templates', {
  id: text('id').primaryKey(),
  kind: text('kind').$type<TemplateKind>().notNull().default('activity'),
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
  // Base64-encoded PNG thumbnail captured from an offscreen Electron BrowserWindow
  thumbnail: text('thumbnail'),
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

// ─── Brands ──────────────────────────────────────────────────────────────────
// Reusable brand profiles that define the visual identity injected into
// activity and interface template previews. Each brand specifies colors,
// typography, and shape tokens that override the default design tokens.

export const brands = sqliteTable('brands', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  primaryColor: text('primary_color').notNull().default('#7458f5'),
  neutralColor: text('neutral_color').notNull().default('#64748b'),
  accentColor: text('accent_color').notNull().default('#3b82f6'),
  fontFamily: text('font_family').notNull().default('Poppins'),
  fontSource: text('font_source').$type<'google' | 'system'>().notNull().default('google'),
  baseFontSize: integer('base_font_size').notNull().default(16),
  typeScaleRatio: text('type_scale_ratio').notNull().default('1.25'),
  borderRadius: text('border_radius').notNull().default('0.325'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

// ─── Assets ──────────────────────────────────────────────────────────────────
// User-uploaded or AI-generated media files. Currently supports images, with
// audio planned for future. Files are stored on disk; this table stores metadata
// and the relative path to the file.

/** Canonical list of asset types. Add new types here as they are supported. */
export const ASSET_TYPES = ['image', 'audio'] as const
export type AssetType = (typeof ASSET_TYPES)[number]

export const assets = sqliteTable('assets', {
  id: text('id').primaryKey(),
  projectId: text('project_id').references(() => projects.id, { onDelete: 'cascade' }), // nullable for global assets
  type: text('type').$type<AssetType>().notNull().default('image'),
  name: text('name').notNull(),
  messages: text('messages', { mode: 'json' }).$type<AssetMessage[]>().default([]),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

// Individual images within an asset (supports multiple generations per chat)
export const assetImages = sqliteTable('asset_images', {
  id: text('id').primaryKey(),
  assetId: text('asset_id').notNull().references(() => assets.id, { onDelete: 'cascade' }),
  prompt: text('prompt'), // generation prompt
  storagePath: text('storage_path').notNull(), // relative path within assets directory
  mimeType: text('mime_type'),
  width: integer('width'),
  height: integer('height'),
  fileSize: integer('file_size'), // bytes
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})

export interface AssetMessage {
  role: 'user' | 'assistant'
  content: string
  toolInvocations?: Array<{
    toolName: string
    args: Record<string, unknown>
    result?: unknown
  }>
}

// ─── Chat Attachments ────────────────────────────────────────────────────────
// User-uploaded images attached to chat messages. Stored on disk with metadata
// in this table. Can belong to either an asset or template chat.

export const chatAttachments = sqliteTable('chat_attachments', {
  id: text('id').primaryKey(),
  assetId: text('asset_id').references(() => assets.id, { onDelete: 'cascade' }),
  templateId: text('template_id').references(() => templates.id, { onDelete: 'cascade' }),
  messageId: text('message_id').notNull(), // Links to UIMessage.id in the chat
  storagePath: text('storage_path').notNull(), // relative path within attachments directory
  mimeType: text('mime_type').notNull(), // typically 'image/webp' after processing
  filename: text('filename'), // original filename if available
  width: integer('width'),
  height: integer('height'),
  fileSize: integer('file_size'), // bytes
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})

// ─── Settings ────────────────────────────────────────────────────────────────
// Key-value store for app settings. General preferences live here.

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})
