import { z } from 'zod'
import { tool } from 'ai'
import { and, eq } from 'drizzle-orm'
import {
  chatTodos,
  type ChatTodoContextType,
  CHAT_TODO_STATUSES,
  CHAT_TODO_PRIORITIES,
} from '~~/server/database/schema'

/**
 * Zod schema for a single todo item.
 * Exported for use in API endpoints and client-side validation.
 */
export const todoItemSchema = z.object({
  content: z.string().min(1).describe('Brief description of the task'),
  status: z.enum(CHAT_TODO_STATUSES).describe('Current status: pending, in_progress, completed, cancelled'),
  priority: z.enum(CHAT_TODO_PRIORITIES).describe('Priority level: high, medium, low'),
})

export type TodoItem = z.infer<typeof todoItemSchema>

/**
 * Server-executed tool for writing/replacing the todo list.
 *
 * This tool replaces the entire todo list for the current chat context.
 * The AI should call this to:
 * - Create initial todos when starting multi-step work
 * - Update task status (mark as in_progress, completed, cancelled)
 * - Add new tasks discovered during work
 * - Reorder or reprioritize tasks
 *
 * The tool is context-aware — contextType and contextId are injected
 * by the chat endpoint, not provided by the LLM.
 */
export function createWriteTodosTool(contextType: ChatTodoContextType, contextId: string) {
  return tool({
    description: `Write or replace the todo list. Use this to track multi-step tasks and show progress. The list is persisted across sessions.

When to use:
- Complex tasks requiring 3+ steps
- When the user provides multiple tasks

When NOT to use:
- Single, trivial tasks
- Pure Q&A conversations

CRITICAL task management rules:
- Mark the current task "in_progress" when you START working on it
- Mark that same task "completed" IMMEDIATELY when you FINISH it, BEFORE moving to the next task
- Only ONE task should be "in_progress" at a time
- Always update the list to mark tasks complete — don't leave them in_progress`,
    inputSchema: z.object({
      todos: z.array(todoItemSchema).describe('The complete todo list (replaces existing)'),
    }),
    execute: async ({ todos }) => {
      const db = useDb()
      const now = new Date()

      // Delete existing todos for this context
      db.delete(chatTodos)
        .where(
          and(
            eq(chatTodos.contextType, contextType),
            eq(chatTodos.contextId, contextId),
          ),
        )
        .run()

      // Insert new todos with position based on array index
      const inserted = todos.map((todo, index) => {
        const id = crypto.randomUUID()
        db.insert(chatTodos)
          .values({
            id,
            contextType,
            contextId,
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
          content: todo.content,
          status: todo.status,
          priority: todo.priority,
          position: index,
        }
      })

      return {
        success: true,
        count: inserted.length,
        todos: inserted,
      }
    },
  })
}
