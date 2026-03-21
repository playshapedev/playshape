import { z } from 'zod'
import { and, eq, asc } from 'drizzle-orm'
import { chatTodos, CHAT_TODO_CONTEXT_TYPES } from '~~/server/database/schema'

const querySchema = z.object({
  contextType: z.enum(CHAT_TODO_CONTEXT_TYPES),
  contextId: z.string().uuid(),
})

/**
 * GET /api/chat-todos?contextType=template&contextId=uuid
 * Returns all todos for a chat context, ordered by position.
 */
export default defineEventHandler((event) => {
  const query = getQuery(event)
  const parsed = querySchema.parse(query)

  const db = useDb()
  return db
    .select()
    .from(chatTodos)
    .where(
      and(
        eq(chatTodos.contextType, parsed.contextType),
        eq(chatTodos.contextId, parsed.contextId),
      ),
    )
    .orderBy(asc(chatTodos.position))
    .all()
})
