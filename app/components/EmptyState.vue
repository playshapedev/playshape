<script setup lang="ts">
defineProps<{
  icon?: string
  title: string
  description?: string
}>()
</script>

<template>
  <div class="flex flex-col items-center justify-center py-12 text-center space-y-4">
    <div v-if="icon" class="rounded-full bg-muted/10 p-4">
      <UIcon :name="icon" class="size-8 text-muted" />
    </div>
    <div class="space-y-1">
      <h3 class="text-lg font-medium text-highlighted">{{ title }}</h3>
      <p v-if="description" class="text-sm text-muted max-w-sm">{{ description }}</p>
    </div>
    <slot />
  </div>
</template>
