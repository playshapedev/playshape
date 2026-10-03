<script setup lang="ts">
/**
 * Displays token usage statistics in a compact format.
 * Used in the upper-right corner of chat panels.
 *
 * Shows conversation tokens inline, with total provider usage on hover.
 */
const props = defineProps<{
  /** Total tokens used in the conversation (this chat thread) */
  totalTokens?: number
  /** Context tokens sent in the latest request */
  contextTokens?: number
  /** Whether context compaction was applied */
  wasCompacted?: boolean
}>()

/**
 * Format a token count for display (e.g., "1.2k", "125k")
 */
function formatTokens(count: number): string {
  if (count < 1000) return count.toString()
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`
  if (count < 1000000) return `${Math.round(count / 1000)}k`
  return `${(count / 1000000).toFixed(1)}M`
}

// Fetch total provider usage for tooltip (lazy load)
const { data: providerUsage } = useLazyFetch('/api/usage', {
  key: 'provider-usage-tooltip',
})

const displayValue = computed(() => {
  if (props.totalTokens) return formatTokens(props.totalTokens)
  if (props.contextTokens) return formatTokens(props.contextTokens)
  return null
})

const conversationLabel = computed(() => {
  if (!props.totalTokens) return null
  return props.totalTokens.toLocaleString()
})

const contextLabel = computed(() => {
  if (!props.contextTokens) return null
  return props.contextTokens.toLocaleString()
})

const allTimeLabel = computed(() => {
  if (!providerUsage.value?.totals?.totalTokens) return null
  return formatTokens(providerUsage.value.totals.totalTokens)
})
</script>

<template>
  <UTooltip v-if="displayValue" :ui="{ content: 'h-auto py-2 px-3' }">
    <div class="flex items-center gap-1 text-xs text-muted font-mono select-none cursor-default">
      <UIcon
        :name="wasCompacted ? 'i-lucide-archive' : 'i-lucide-coins'"
        class="size-3"
        :class="wasCompacted ? 'text-warning' : ''"
      />
      <span>{{ displayValue }}</span>
    </div>

    <template #content>
      <div class="text-xs space-y-1.5">
        <div class="font-medium text-highlighted">This conversation</div>
        <div v-if="conversationLabel" class="flex justify-between gap-4">
          <span class="text-muted">Tokens:</span>
          <span class="font-mono">{{ conversationLabel }}</span>
        </div>
        <div v-if="contextLabel" class="flex justify-between gap-4">
          <span class="text-muted">Context:</span>
          <span class="font-mono">{{ contextLabel }}</span>
        </div>
        <div v-if="wasCompacted" class="text-warning text-xs">
          Context was compacted
        </div>
        <template v-if="allTimeLabel">
          <div class="border-t border-default my-1.5" />
          <div class="flex justify-between gap-4">
            <span class="text-muted">All time:</span>
            <span class="font-mono">{{ allTimeLabel }}</span>
          </div>
        </template>
      </div>
    </template>
  </UTooltip>
</template>
