<script setup lang="ts">
import type { Template } from '~/composables/useTemplates'

const props = defineProps<{
  template: Template
}>()

const emit = defineEmits<{
  useTemplate: [template: Template]
}>()

const isDefault = computed(() => props.template.source === 'default')
</script>

<template>
  <!-- Default templates: click triggers "Use Template" instead of navigating -->
  <div v-if="isDefault" class="block cursor-pointer" @click="emit('useTemplate', template)">
    <UCard
      class="hover:ring-primary/50 hover:ring-2 transition-all h-full overflow-hidden"
      :ui="{ body: 'p-0' }"
    >
      <!-- Thumbnail -->
      <div v-if="template.thumbnail" class="aspect-video w-full overflow-hidden bg-elevated">
        <img :src="template.thumbnail" :alt="template.name" class="w-full h-full object-cover object-top">
      </div>
      <div v-else class="aspect-video w-full flex items-center justify-center bg-elevated">
        <UIcon name="i-lucide-layout-template" class="size-8 text-dimmed" />
      </div>

      <div class="p-4 space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="font-semibold text-highlighted truncate">{{ template.name }}</h3>
          <UBadge label="Default" color="primary" variant="subtle" size="xs" />
        </div>
        <p v-if="template.description" class="text-sm text-muted line-clamp-2">
          {{ template.description }}
        </p>
        <div class="pt-1">
          <UButton
            label="Use Template"
            icon="i-lucide-copy"
            size="xs"
            variant="soft"
            block
            @click.stop="emit('useTemplate', template)"
          />
        </div>
      </div>
    </UCard>
  </div>

  <!-- User templates: click navigates to editor -->
  <NuxtLink v-else :to="`/templates/${template.id}`" class="block">
    <UCard
      class="hover:ring-primary/50 hover:ring-2 transition-all cursor-pointer h-full overflow-hidden"
      :ui="{ body: 'p-0' }"
    >
      <div v-if="template.thumbnail" class="aspect-video w-full overflow-hidden bg-elevated">
        <img :src="template.thumbnail" :alt="template.name" class="w-full h-full object-cover object-top">
      </div>
      <div v-else class="aspect-video w-full flex items-center justify-center bg-elevated">
        <UIcon name="i-lucide-layout-template" class="size-8 text-dimmed" />
      </div>

      <div class="p-4 space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="font-semibold text-highlighted truncate">{{ template.name }}</h3>
          <UBadge
            :label="template.status"
            :color="template.status === 'published' ? 'success' : 'neutral'"
            variant="subtle"
            size="xs"
          />
          <UBadge
            v-if="template.schemaVersion > 1"
            :label="`v${template.schemaVersion}`"
            color="info"
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
