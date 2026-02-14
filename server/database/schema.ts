import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

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

// ─── Content ─────────────────────────────────────────────────────────────────
// Source content uploaded by the designer — chunked at paragraph level for
// embedding and semantic search.

export const content = sqliteTable('content', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  sourceType: text('source_type').notNull(), // 'text', 'document', 'url'
  sourceRef: text('source_ref'), // original filename or URL
  body: text('body').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})

export const contentChunks = sqliteTable('content_chunks', {
  id: text('id').primaryKey(),
  contentId: text('content_id').notNull().references(() => content.id, { onDelete: 'cascade' }),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  chunkIndex: integer('chunk_index').notNull(),
  // Embedding vector stored as JSON array of floats.
  // On desktop, also indexed in sqlite-vec virtual table for KNN search.
  embedding: text('embedding', { mode: 'json' }).$type<number[]>(),
})

// ─── Settings ────────────────────────────────────────────────────────────────
// Key-value store for app settings. LLM provider configs (minus API keys,
// which go in OS secure storage) live here.

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})
