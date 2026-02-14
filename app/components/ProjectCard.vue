<script setup lang="ts">
defineProps<{
  project: {
    id: string
    name: string
    description: string | null
    createdAt: string | number | Date
    updatedAt: string | number | Date
  }
}>()
</script>

<template>
  <UCard
    as="NuxtLink"
    :to="`/projects/${project.id}`"
    class="hover:ring-primary/50 hover:ring-2 transition-all cursor-pointer"
  >
    <div class="space-y-2">
      <h3 class="font-semibold text-highlighted truncate">
        {{ project.name }}
      </h3>
      <p v-if="project.description" class="text-sm text-muted line-clamp-2">
        {{ project.description }}
      </p>
      <p class="text-xs text-dimmed">
        Created {{ new Date(project.createdAt).toLocaleDateString() }}
      </p>
    </div>
  </UCard>
</template>
