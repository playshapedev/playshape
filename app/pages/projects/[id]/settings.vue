<script setup lang="ts">
const { project } = inject<{ project: Ref<{ description?: string | null, createdAt: string | number | Date, updatedAt: string | number | Date } | null> }>('project')!
</script>

<template>
  <div v-if="project" class="space-y-6">
    <!-- Description -->
    <p v-if="project.description" class="text-muted">
      {{ project.description }}
    </p>

    <!-- Project info -->
    <UCard>
      <div class="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span class="text-muted">Created</span>
          <p class="font-medium">{{ new Date(project.createdAt).toLocaleDateString() }}</p>
        </div>
        <div>
          <span class="text-muted">Last Updated</span>
          <p class="font-medium">{{ new Date(project.updatedAt).toLocaleDateString() }}</p>
        </div>
      </div>
    </UCard>
  </div>
</template>
