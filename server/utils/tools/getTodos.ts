import { z } from 'zod'
import { tool } from 'ai'
import { and, eq, asc } from 'drizzle-orm'
import { chatTodos, type ChatTodoContextType } from '~~/server/database/schema'

/**
 * Server-executed tool for reading the current todo list.
 *
 * The AI should call this to:
 * - Resume work on a previous session
 * - Check current task status before updating
 * - Review what has been completed
 *
 * The tool is context-aware — contextType and contextId are injected
 * by the chat endpoint, not provided by the LLM.
 */
export function createGetTodosTool(contextType: ChatTodoContextType, contextId: string) {
  return tool({
    description: 'Read the current todo list. Use this to check existing tasks, resume work from a previous session, or verify current status before making updates.',
    inputSchema: z.object({}),
    execute: async () => {
      const db = useDb()

      const todos = db
        .select({
          id: chatTodos.id,
          content: chatTodos.content,
          status: chatTodos.status,
          priority: chatTodos.priority,
          position: chatTodos.position,
        })
        .from(chatTodos)
        .where(
          and(
            eq(chatTodos.contextType, contextType),
            eq(chatTodos.contextId, contextId),
          ),
        )
        .orderBy(asc(chatTodos.position))
        .all()

      if (todos.length === 0) {
        return {
          message: 'No todos found for this context.',
          todos: [],
        }
      }

      return {
        message: `Found ${todos.length} todo(s).`,
        todos,
      }
    },
  })
}
