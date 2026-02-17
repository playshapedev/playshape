<script setup lang="ts">
import type { Asset } from '~/composables/useAssets'

defineProps<{
  asset: Asset
}>()

function formatFileSize(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
</script>

<template>
  <NuxtLink :to="`/assets/${asset.id}`" class="block">
    <UCard
      class="hover:ring-primary/50 hover:ring-2 transition-all cursor-pointer h-full overflow-hidden"
      :ui="{ body: 'p-0' }"
    >
      <!-- Image preview -->
      <div
        v-if="asset.storagePath"
        class="aspect-square w-full overflow-hidden bg-elevated"
      >
        <img
          :src="getAssetFileUrl(asset.id)"
          :alt="asset.name"
          class="w-full h-full object-cover"
        >
      </div>
      <!-- Placeholder when no image yet -->
      <div
        v-else
        class="aspect-square w-full flex items-center justify-center bg-elevated"
      >
        <UIcon name="i-lucide-image-plus" class="size-8 text-dimmed" />
      </div>

      <!-- Card body -->
      <div class="p-3 space-y-1">
        <h3 class="font-medium text-highlighted truncate text-sm">
          {{ asset.name }}
        </h3>
        <div class="flex items-center gap-2 text-xs text-dimmed">
          <span v-if="asset.width && asset.height">
            {{ asset.width }} x {{ asset.height }}
          </span>
          <span v-if="asset.fileSize">
            {{ formatFileSize(asset.fileSize) }}
          </span>
        </div>
      </div>
    </UCard>
  </NuxtLink>
</template>
