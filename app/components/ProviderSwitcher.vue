<script setup lang="ts">
import type { AIProviderType } from '~/composables/useAIProviders'

defineProps<{
  collapsed?: boolean
}>()

const toast = useToast()

// Close dropdown when sidebar hides
const dropdownOpen = ref(false)
const sidebarVisible = inject<Ref<boolean>>('sidebarVisible', ref(true))

watch(sidebarVisible, (visible) => {
  if (!visible) dropdownOpen.value = false
})

const { providers, pending, refresh } = useAIProviders()

// Get active text model
const activeTextModel = computed(() => getActiveTextModel(providers.value))

/**
 * Extract the short model name from a full model path.
 * e.g. "accounts/fireworks/models/kimi-k2p5" -> "kimi-k2p5"
 */
function shortModelName(modelId: string): string {
  return modelId.split('/').pop() || modelId
}

const activeMeta = computed(() => {
  if (!activeTextModel.value) return null
  return AI_PROVIDER_META[activeTextModel.value.provider.type as AIProviderType]
})

// Build menu items from all enabled text models across providers
const menuItems = computed(() => {
  if (!providers.value?.length) return []

  const textModelItems: Array<{
    label: string
    icon: string
    disabled?: boolean
    suffix?: string
    onSelect: () => void
  }> = []

  for (const provider of providers.value) {
    const meta = AI_PROVIDER_META[provider.type as AIProviderType]
    const textModels = provider.models.filter(m => m.purpose === 'text')

    for (const model of textModels) {
      textModelItems.push({
        label: model.name || shortModelName(model.modelId),
        icon: meta?.icon || 'i-lucide-bot',
        disabled: model.isActive,
        suffix: model.isActive ? 'Active' : undefined,
        onSelect: () => switchModel(model.id),
      })
    }
  }

  if (textModelItems.length === 0) {
    return [[{
      label: 'Configure AI Providers',
      icon: 'i-lucide-settings',
      onSelect: () => navigateTo('/settings/ai'),
    }]]
  }

  return [
    textModelItems,
    [{
      label: 'Manage Providers',
      icon: 'i-lucide-settings',
      onSelect: () => navigateTo('/settings/ai'),
    }],
  ]
})

async function switchModel(modelId: string) {
  try {
    await activateAIModel(modelId)
    await refresh()
    toast.add({
      title: 'Model switched',
      color: 'success',
      icon: 'i-lucide-check-circle',
    })
  }
  catch {
    toast.add({
      title: 'Failed to switch model',
      color: 'error',
      icon: 'i-lucide-x-circle',
    })
  }
}
</script>

<template>
  <div class="w-full min-w-0 overflow-hidden">
    <!-- No providers configured -->
    <NuxtLink
      v-if="!pending && !providers?.length"
      to="/settings/ai"
      class="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-muted hover:bg-elevated transition-colors min-w-0"
    >
      <UIcon name="i-lucide-bot" class="size-4 shrink-0" />
      <span v-if="!collapsed" class="truncate">Set up AI provider</span>
    </NuxtLink>

    <!-- Provider switcher -->
    <UDropdownMenu v-else-if="providers?.length" v-model:open="dropdownOpen" :items="menuItems">
      <button
        class="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs hover:bg-elevated transition-colors cursor-pointer min-w-0"
        :class="collapsed ? 'justify-center' : ''"
      >
        <UIcon
          :name="activeMeta?.icon || 'i-lucide-bot'"
          class="size-4 shrink-0"
          :class="activeTextModel ? 'text-primary' : 'text-muted'"
        />
        <template v-if="!collapsed">
          <span v-if="activeTextModel" class="truncate text-muted">
            {{ activeTextModel.model.name || shortModelName(activeTextModel.model.modelId) }}
          </span>
          <span v-else class="truncate text-dimmed">
            No active model
          </span>
          <UIcon name="i-lucide-chevrons-up-down" class="size-3 text-dimmed shrink-0 ml-auto" />
        </template>
      </button>
    </UDropdownMenu>
  </div>
</template>
