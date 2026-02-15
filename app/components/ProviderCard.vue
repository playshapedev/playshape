<script setup lang="ts">
import type { LLMProvider } from '~/composables/useLLMProviders'

const props = defineProps<{
  provider: LLMProvider
}>()

const emit = defineEmits<{
  edit: []
  delete: []
  activate: []
  test: []
}>()

const providerMeta = computed(() => PROVIDER_TYPES[props.provider.type as keyof typeof PROVIDER_TYPES])

const menuItems = computed(() => [
  [
    {
      label: 'Edit',
      icon: 'i-lucide-pencil',
      onSelect: () => emit('edit'),
    },
    ...(!props.provider.isActive
      ? [{
          label: 'Set as Active',
          icon: 'i-lucide-check-circle',
          onSelect: () => emit('activate'),
        }]
      : []),
    {
      label: 'Test Connection',
      icon: 'i-lucide-activity',
      onSelect: () => emit('test'),
    },
  ],
  [
    {
      label: 'Delete',
      icon: 'i-lucide-trash-2',
      color: 'error' as const,
      onSelect: () => emit('delete'),
    },
  ],
])
</script>

<template>
  <UCard>
    <div class="flex items-center justify-between gap-3">
      <div class="flex items-center gap-3 min-w-0">
        <div class="flex items-center justify-center size-10 rounded-lg bg-elevated shrink-0">
          <UIcon :name="providerMeta?.icon || 'i-lucide-bot'" class="size-5" />
        </div>
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <h3 class="font-semibold truncate">{{ providerMeta?.label }}</h3>
            <UBadge
              v-if="provider.isActive"
              label="Active"
              color="primary"
              variant="subtle"
              size="xs"
            />
          </div>
          <p class="text-sm text-muted truncate">
            {{ provider.model }}
          </p>
        </div>
      </div>

      <UDropdownMenu :items="menuItems">
        <UButton
          icon="i-lucide-ellipsis-vertical"
          variant="ghost"
          color="neutral"
          size="sm"
        />
      </UDropdownMenu>
    </div>
  </UCard>
</template>
