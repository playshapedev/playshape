<script setup lang="ts">
/**
 * Renders a todo list from the write_todos tool output.
 * Displayed inline in chat when the AI writes or updates todos.
 */
import type { ChatTodoStatus, ChatTodoPriority } from '~~/server/database/schema'

interface TodoItem {
  id: string
  content: string
  status: ChatTodoStatus
  priority: ChatTodoPriority
  position: number
}

interface WriteTodosOutput {
  success: boolean
  count: number
  todos: TodoItem[]
}

const props = defineProps<{
  output: WriteTodosOutput
}>()

// Status styling
const statusConfig: Record<ChatTodoStatus, { icon: string; class: string }> = {
  pending: { icon: 'i-lucide-circle', class: 'text-muted' },
  in_progress: { icon: 'i-lucide-minus-square', class: 'text-primary' },
  completed: { icon: 'i-lucide-check-circle', class: 'text-success' },
  cancelled: { icon: 'i-lucide-x-circle', class: 'text-dimmed' },
}

// Priority styling (subtle indicator)
const priorityConfig: Record<ChatTodoPriority, { class: string }> = {
  high: { class: 'border-l-2 border-error pl-2' },
  medium: { class: 'border-l-2 border-warning pl-2' },
  low: { class: 'pl-2' },
}

function getStatusConfig(status: ChatTodoStatus) {
  return statusConfig[status] || statusConfig.pending
}

function getPriorityConfig(priority: ChatTodoPriority) {
  return priorityConfig[priority] || priorityConfig.medium
}
</script>

<template>
  <div class="text-xs space-y-1 py-1">
    <div class="flex items-center gap-1.5 text-muted mb-1">
      <UIcon name="i-lucide-list-todo" class="size-3.5" />
      <span>{{ output.count }} task{{ output.count !== 1 ? 's' : '' }}</span>
    </div>

    <div
      v-for="todo in output.todos"
      :key="todo.id"
      class="flex items-start gap-2 py-0.5"
      :class="[
        getPriorityConfig(todo.priority).class,
        todo.status === 'completed' || todo.status === 'cancelled' ? 'opacity-60' : ''
      ]"
    >
      <UIcon
        :name="getStatusConfig(todo.status).icon"
        :class="['size-3.5 mt-0.5 shrink-0', getStatusConfig(todo.status).class]"
      />
      <span
        :class="[
          'leading-tight',
          todo.status === 'completed' ? 'line-through text-muted' : '',
          todo.status === 'cancelled' ? 'line-through text-dimmed' : ''
        ]"
      >
        {{ todo.content }}
      </span>
    </div>
  </div>
</template>
