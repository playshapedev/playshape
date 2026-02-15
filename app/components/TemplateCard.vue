<script setup lang="ts">
import type { Template } from '~/composables/useTemplates'

defineProps<{
  template: Template
}>()
</script>

<template>
  <NuxtLink :to="`/templates/${template.id}`" class="block">
    <UCard class="hover:ring-primary/50 hover:ring-2 transition-all cursor-pointer h-full">
      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="font-semibold text-highlighted truncate">
            {{ template.name }}
          </h3>
          <UBadge
            :label="template.status"
            :color="template.status === 'published' ? 'success' : 'neutral'"
            variant="subtle"
            size="xs"
          />
        </div>
        <p v-if="template.description" class="text-sm text-muted line-clamp-2">
          {{ template.description }}
        </p>
        <p class="text-xs text-dimmed">
          Updated {{ new Date(template.updatedAt).toLocaleDateString() }}
        </p>
      </div>
    </UCard>
  </NuxtLink>
</template>
