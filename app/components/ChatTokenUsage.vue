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

const tooltip = computed(() => {
  const parts: string[] = []

  // Conversation stats (primary)
  parts.push('This conversation')
  if (props.totalTokens) {
    parts.push(`${props.totalTokens.toLocaleString()} tokens`)
  }
  if (props.contextTokens) {
    parts.push(`Context: ${props.contextTokens.toLocaleString()}`)
  }
  if (props.wasCompacted) {
    parts.push('(compacted)')
  }

  // Total provider usage (secondary)
  if (providerUsage.value?.totals?.totalTokens) {
    parts.push('')
    parts.push(`All time: ${formatTokens(providerUsage.value.totals.totalTokens)} tokens`)
  }

  return parts.join('\n') || 'Token usage'
})
</script>

<template>
  <UTooltip v-if="displayValue" :text="tooltip">
    <div class="flex items-center gap-1 text-xs text-muted font-mono">
      <UIcon
        :name="wasCompacted ? 'i-lucide-archive' : 'i-lucide-coins'"
        class="size-3"
        :class="wasCompacted ? 'text-warning' : ''"
      />
      <span>{{ displayValue }}</span>
    </div>
  </UTooltip>
</template>
