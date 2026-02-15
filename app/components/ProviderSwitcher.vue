<script setup lang="ts">
import type { LLMProvider } from '~/composables/useLLMProviders'

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

const { providers, pending, refresh } = useLLMProviders()

const activeProvider = computed(() =>
  providers.value?.find(p => p.isActive) ?? null,
)

/**
 * Extract the short model name from a full model path.
 * e.g. "accounts/fireworks/models/kimi-k2p5" -> "kimi-k2p5"
 */
function shortModelName(model: string): string {
  return model.split('/').pop() || model
}

const activeMeta = computed(() => {
  if (!activeProvider.value) return null
  return PROVIDER_TYPES[activeProvider.value.type as keyof typeof PROVIDER_TYPES]
})

const menuItems = computed(() => {
  if (!providers.value?.length) return []

  const providerItems = providers.value.map((p) => {
    const meta = PROVIDER_TYPES[p.type as keyof typeof PROVIDER_TYPES]
    return {
      label: shortModelName(p.model),
      icon: meta?.icon || 'i-lucide-bot',
      disabled: p.isActive,
      suffix: p.isActive ? 'Active' : undefined,
      onSelect: () => switchProvider(p),
    }
  })

  return [
    providerItems,
    [{
      label: 'Manage Providers',
      icon: 'i-lucide-settings',
      onSelect: () => navigateTo('/settings/providers'),
    }],
  ]
})

async function switchProvider(provider: LLMProvider) {
  if (provider.isActive) return
  try {
    await activateLLMProvider(provider.id)
    await refresh()
    toast.add({
      title: `Switched to ${shortModelName(provider.model)}`,
      color: 'success',
      icon: 'i-lucide-check-circle',
    })
  }
  catch {
    toast.add({
      title: 'Failed to switch provider',
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
      to="/settings/providers"
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
          :class="activeProvider ? 'text-primary' : 'text-muted'"
        />
        <template v-if="!collapsed">
          <span v-if="activeProvider" class="truncate text-muted">
            {{ shortModelName(activeProvider.model) }}
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
