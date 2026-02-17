<script setup lang="ts">
import type { AIProviderWithModels, AIProviderType, AIModelPurpose } from '~/composables/useAIProviders'

const props = defineProps<{
  provider: AIProviderWithModels
}>()

const emit = defineEmits<{
  configure: []
  delete: []
  activateModel: [modelId: string, purpose: AIModelPurpose]
}>()

const meta = computed(() => AI_PROVIDER_META[props.provider.type as AIProviderType])

const textModels = computed(() => props.provider.models.filter(m => m.purpose === 'text'))
const imageModels = computed(() => props.provider.models.filter(m => m.purpose === 'image'))

const hasApiKey = computed(() => !!props.provider.apiKey)

const menuItems = computed(() => [
  [
    {
      label: 'Configure',
      icon: 'i-lucide-settings',
      onSelect: () => emit('configure'),
    },
  ],
  [
    {
      label: 'Remove',
      icon: 'i-lucide-trash-2',
      color: 'error' as const,
      onSelect: () => emit('delete'),
    },
  ],
])
</script>

<template>
  <UCard>
    <div class="space-y-4">
      <!-- Header -->
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-3 min-w-0">
          <div class="flex items-center justify-center size-10 rounded-lg bg-elevated shrink-0">
            <UIcon :name="meta?.icon || 'i-lucide-bot'" class="size-5" />
          </div>
          <div class="min-w-0">
            <h3 class="font-semibold">{{ meta?.label }}</h3>
            <p class="text-sm text-muted">
              <template v-if="hasApiKey">
                <span class="text-success">API key configured</span>
              </template>
              <template v-else-if="meta?.needsApiKey">
                <span class="text-warning">API key required</span>
              </template>
              <template v-else>
                {{ provider.baseUrl || meta?.defaultBaseUrl }}
              </template>
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

      <!-- Models -->
      <div v-if="provider.models.length > 0" class="space-y-3">
        <!-- Text Models -->
        <div v-if="textModels.length > 0">
          <p class="text-xs font-medium text-muted uppercase tracking-wide mb-2">Text Models</p>
          <div class="flex flex-wrap gap-2">
            <UBadge
              v-for="model in textModels"
              :key="model.id"
              :label="model.name"
              :color="model.isActive ? 'primary' : 'neutral'"
              :variant="model.isActive ? 'solid' : 'subtle'"
              class="cursor-pointer"
              @click="emit('activateModel', model.id, 'text')"
            />
          </div>
        </div>

        <!-- Image Models -->
        <div v-if="imageModels.length > 0">
          <p class="text-xs font-medium text-muted uppercase tracking-wide mb-2">Image Models</p>
          <div class="flex flex-wrap gap-2">
            <UBadge
              v-for="model in imageModels"
              :key="model.id"
              :label="model.name"
              :color="model.isActive ? 'primary' : 'neutral'"
              :variant="model.isActive ? 'solid' : 'subtle'"
              class="cursor-pointer"
              @click="emit('activateModel', model.id, 'image')"
            />
          </div>
        </div>
      </div>

      <!-- No Models -->
      <p v-else class="text-sm text-muted italic">
        No models enabled.
        <button class="text-primary hover:underline" @click="emit('configure')">
          Configure
        </button>
        to add models.
      </p>
    </div>
  </UCard>
</template>
