<script setup lang="ts">
import type { CourseListItem } from '~/composables/useCourses'

defineProps<{
  course: CourseListItem
  projectId: string
}>()

defineEmits<{
  delete: [id: string]
}>()
</script>

<template>
  <NuxtLink
    :to="`/projects/${projectId}/courses/${course.id}`"
    class="block p-4 rounded-lg border border-default hover:border-primary/50 transition-colors group"
  >
    <div class="flex items-start justify-between gap-3">
      <div class="flex-1 min-w-0">
        <h3 class="font-medium text-highlighted truncate">
          {{ course.name }}
        </h3>
        <p v-if="course.description" class="text-sm text-muted mt-1 line-clamp-2">
          {{ course.description }}
        </p>
      </div>
      <UButton
        icon="i-lucide-trash-2"
        color="error"
        variant="ghost"
        size="xs"
        class="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
        @click.prevent="$emit('delete', course.id)"
      />
    </div>
    <div class="flex items-center gap-3 mt-3 text-xs text-dimmed">
      <span class="flex items-center gap-1">
        <UIcon name="i-lucide-play-circle" class="size-3.5" />
        {{ course.activityCount }} {{ course.activityCount === 1 ? 'activity' : 'activities' }}
      </span>
      <span v-if="course.templateName" class="flex items-center gap-1">
        <UIcon name="i-lucide-panel-top" class="size-3.5" />
        {{ course.templateName }}
      </span>
    </div>
  </NuxtLink>
</template>
