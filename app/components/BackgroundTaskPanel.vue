<script setup lang="ts">
import type { BackgroundTask, ImageGenerationResult, VideoProcessingResult } from '~/composables/useBackgroundTasks'

const {
  tasks,
  pendingTasks,
  hasPendingTasks,
  removeTask,
  clearCompleted,
} = useBackgroundTasks()

// Panel visibility
const isOpen = ref(false)

// Auto-open when a new task is added
const previousTaskCount = ref(0)
watch(tasks, (newTasks) => {
  if (newTasks.length > previousTaskCount.value) {
    isOpen.value = true
  }
  previousTaskCount.value = newTasks.length
}, { deep: true })

// Get icon based on task type and status
function getTaskIcon(task: BackgroundTask): string {
  if (task.status === 'completed') return 'i-lucide-check-circle'
  if (task.status === 'failed') return 'i-lucide-x-circle'

  switch (task.type) {
    case 'image-generation':
      return 'i-lucide-image'
    case 'video-upload':
    case 'video-processing':
      return 'i-lucide-video'
    default:
      return 'i-lucide-loader-circle'
  }
}

// Get icon color based on status
function getIconColor(task: BackgroundTask): string {
  switch (task.status) {
    case 'completed':
      return 'text-success'
    case 'failed':
      return 'text-error'
    case 'running':
      return 'text-primary'
    default:
      return 'text-muted'
  }
}

// Format relative time
function formatTime(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'Just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ago`
}

// Navigate to the result (for completed tasks)
const router = useRouter()

function navigateToResult(task: BackgroundTask) {
  if (task.status !== 'completed' || !task.result) return

  const result = task.result as ImageGenerationResult | VideoProcessingResult
  if ('assetId' in result) {
    router.push(`/assets/${result.assetId}`)
    isOpen.value = false
  }
}

// Check if task has a navigable result
function hasNavigableResult(task: BackgroundTask): boolean {
  if (task.status !== 'completed' || !task.result) return false
  const result = task.result as ImageGenerationResult | VideoProcessingResult
  return 'assetId' in result
}
</script>

<template>
  <div class="fixed bottom-4 right-4 z-50">
    <!-- Collapsed indicator button -->
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      enter-from-class="opacity-0 scale-90"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition-all duration-150 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-90"
    >
      <UButton
        v-if="!isOpen && tasks.length > 0"
        :icon="hasPendingTasks ? 'i-lucide-loader-circle' : 'i-lucide-check-circle'"
        :class="hasPendingTasks ? 'animate-pulse' : ''"
        color="primary"
        variant="solid"
        size="lg"
        class="shadow-lg"
        @click="isOpen = true"
      >
        <template v-if="pendingTasks.length > 0">
          {{ pendingTasks.length }} running
        </template>
        <template v-else>
          {{ tasks.length }} completed
        </template>
      </UButton>
    </Transition>

    <!-- Expanded panel -->
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      enter-from-class="opacity-0 translate-y-4 scale-95"
      enter-to-class="opacity-100 translate-y-0 scale-100"
      leave-active-class="transition-all duration-150 ease-in"
      leave-from-class="opacity-100 translate-y-0 scale-100"
      leave-to-class="opacity-0 translate-y-4 scale-95"
    >
      <UCard
        v-if="isOpen"
        class="w-80 max-h-96 overflow-hidden shadow-xl"
        :ui="{ body: 'p-0', header: 'p-3', footer: 'p-2' }"
      >
        <template #header>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <h3 class="font-medium text-sm text-highlighted">Background Tasks</h3>
              <UBadge v-if="pendingTasks.length > 0" color="primary" variant="subtle" size="xs">
                {{ pendingTasks.length }} active
              </UBadge>
            </div>
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="xs"
              @click="isOpen = false"
            />
          </div>
        </template>

        <!-- Task list -->
        <div class="max-h-64 overflow-y-auto divide-y divide-default">
          <TransitionGroup
            enter-active-class="transition-all duration-200 ease-out"
            enter-from-class="opacity-0 -translate-x-4"
            enter-to-class="opacity-100 translate-x-0"
            leave-active-class="transition-all duration-150 ease-in absolute w-full"
            leave-from-class="opacity-100"
            leave-to-class="opacity-0 translate-x-4"
            move-class="transition-transform duration-200"
          >
            <div
              v-for="task in tasks"
              :key="task.id"
              class="relative p-3 hover:bg-elevated/50 transition-colors"
              :class="{ 'cursor-pointer': hasNavigableResult(task) }"
              @click="navigateToResult(task)"
            >
              <div class="flex items-start gap-3">
                <!-- Status icon -->
                <UIcon
                  :name="getTaskIcon(task)"
                  class="size-5 flex-shrink-0 mt-0.5"
                  :class="[
                    getIconColor(task),
                    task.status === 'running' ? 'animate-spin' : '',
                  ]"
                />

                <!-- Task info -->
                <div class="flex-1 min-w-0">
                  <div class="flex items-center justify-between gap-2">
                    <p class="text-sm font-medium text-highlighted truncate">
                      {{ task.title }}
                    </p>
                    <!-- Remove button for completed/failed tasks -->
                    <UButton
                      v-if="task.status === 'completed' || task.status === 'failed'"
                      icon="i-lucide-x"
                      color="neutral"
                      variant="ghost"
                      size="2xs"
                      class="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      @click.stop="removeTask(task.id)"
                    />
                  </div>

                  <p v-if="task.description" class="text-xs text-muted truncate mt-0.5">
                    {{ task.description }}
                  </p>

                  <!-- Progress bar for running tasks -->
                  <div
                    v-if="task.status === 'running' && task.progress !== undefined"
                    class="mt-2"
                  >
                    <UProgress :value="task.progress" size="xs" />
                  </div>

                  <!-- Error message -->
                  <p v-if="task.status === 'failed' && task.error" class="text-xs text-error mt-1 line-clamp-2">
                    {{ task.error }}
                  </p>

                  <!-- Timestamp -->
                  <p class="text-xs text-dimmed mt-1">
                    {{ formatTime(task.completedAt || task.createdAt) }}
                  </p>
                </div>
              </div>
            </div>
          </TransitionGroup>

          <!-- Empty state -->
          <div v-if="tasks.length === 0" class="p-6 text-center">
            <UIcon name="i-lucide-inbox" class="size-8 text-muted mx-auto mb-2" />
            <p class="text-sm text-muted">No background tasks</p>
          </div>
        </div>

        <template v-if="tasks.some((t: BackgroundTask) => t.status === 'completed' || t.status === 'failed')" #footer>
          <div class="flex justify-end">
            <UButton
              label="Clear completed"
              color="neutral"
              variant="ghost"
              size="xs"
              @click="clearCompleted"
            />
          </div>
        </template>
      </UCard>
    </Transition>
  </div>
</template>
