<script setup lang="ts">
defineProps<{
  library: {
    id: string
    name: string
    description: string | null
    documentCount?: number
    createdAt: string | number | Date
    updatedAt: string | number | Date
  }
}>()
</script>

<template>
  <NuxtLink :to="`/libraries/${library.id}`" class="block">
    <UCard class="hover:ring-primary/50 hover:ring-2 transition-all cursor-pointer h-full">
      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-library-big" class="size-4 text-primary shrink-0" />
          <h3 class="font-semibold text-highlighted truncate">
            {{ library.name }}
          </h3>
        </div>
        <p v-if="library.description" class="text-sm text-muted line-clamp-2">
          {{ library.description }}
        </p>
        <div class="flex items-center gap-3 text-xs text-dimmed">
          <span class="flex items-center gap-1">
            <UIcon name="i-lucide-file-text" class="size-3" />
            {{ library.documentCount ?? 0 }} {{ (library.documentCount ?? 0) === 1 ? 'document' : 'documents' }}
          </span>
          <span>
            Created {{ new Date(library.createdAt).toLocaleDateString() }}
          </span>
        </div>
      </div>
    </UCard>
  </NuxtLink>
</template>
