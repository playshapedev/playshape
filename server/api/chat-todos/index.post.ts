import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import {
  chatTodos,
  CHAT_TODO_CONTEXT_TYPES,
  CHAT_TODO_STATUSES,
  CHAT_TODO_PRIORITIES,
} from '~~/server/database/schema'

const todoItemSchema = z.object({
  content: z.string().min(1),
  status: z.enum(CHAT_TODO_STATUSES).default('pending'),
  priority: z.enum(CHAT_TODO_PRIORITIES).default('medium'),
})

const bodySchema = z.object({
  contextType: z.enum(CHAT_TODO_CONTEXT_TYPES),
  contextId: z.string().uuid(),
  todos: z.array(todoItemSchema),
})

export type ChatTodoInput = z.infer<typeof todoItemSchema>

/**
 * POST /api/chat-todos
 * Replaces all todos for a chat context with the provided list.
 * This is a "write entire list" operation — not incremental updates.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const parsed = bodySchema.parse(body)

  const db = useDb()
  const now = new Date()

  // Delete existing todos for this context
  db.delete(chatTodos)
    .where(
      and(
        eq(chatTodos.contextType, parsed.contextType),
        eq(chatTodos.contextId, parsed.contextId),
      ),
    )
    .run()

  // Insert new todos with position based on array index
  const inserted = parsed.todos.map((todo, index) => {
    const id = crypto.randomUUID()
    db.insert(chatTodos)
      .values({
        id,
        contextType: parsed.contextType,
        contextId: parsed.contextId,
        content: todo.content,
        status: todo.status,
        priority: todo.priority,
        position: index,
        createdAt: now,
        updatedAt: now,
      })
      .run()

    return {
      id,
      contextType: parsed.contextType,
      contextId: parsed.contextId,
      content: todo.content,
      status: todo.status,
      priority: todo.priority,
      position: index,
      createdAt: now,
      updatedAt: now,
    }
  })

  return inserted
})
