<script setup lang="ts">
import type { AssetWithImages } from '~/composables/useAssets'

const props = defineProps<{
  asset: AssetWithImages
}>()

// Get the most recent image (first in the array since sorted by createdAt desc)
const latestImage = computed(() => props.asset.images?.[0] || null)

const thumbnailUrl = computed(() => {
  if (!latestImage.value) return null
  return getAssetImageUrl(props.asset.id, latestImage.value.id)
})
</script>

<template>
  <NuxtLink :to="`/assets/${asset.id}`" class="block">
    <UCard
      class="hover:ring-primary/50 hover:ring-2 transition-all cursor-pointer h-full overflow-hidden"
      :ui="{ body: 'p-0' }"
    >
      <!-- Image preview -->
      <div
        v-if="thumbnailUrl"
        class="aspect-square w-full overflow-hidden bg-elevated relative"
      >
        <img
          :src="thumbnailUrl"
          :alt="asset.name"
          class="w-full h-full object-cover"
        >
        <!-- Image count badge -->
        <div
          v-if="asset.imageCount > 1"
          class="absolute bottom-2 right-2 px-2 py-0.5 rounded-full bg-black/60 text-white text-xs font-medium flex items-center gap-1"
        >
          <UIcon name="i-lucide-images" class="size-3" />
          {{ asset.imageCount }}
        </div>
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
          <span v-if="latestImage?.width && latestImage.height">
            {{ latestImage.width }} x {{ latestImage.height }}
          </span>
          <span v-if="asset.imageCount === 0">
            No images
          </span>
          <span v-else-if="asset.imageCount === 1">
            1 image
          </span>
          <span v-else>
            {{ asset.imageCount }} images
          </span>
        </div>
      </div>
    </UCard>
  </NuxtLink>
</template>
