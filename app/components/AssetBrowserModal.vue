<script setup lang="ts">
import type { AssetWithImages, AssetImage } from '~/composables/useAssets'

const props = defineProps<{
  /** Only show assets of this type */
  assetType?: 'image' | 'video'
  /** Filter to a specific project (optional) */
  projectId?: string
}>()

const emit = defineEmits<{
  /** Emitted when user selects an asset image */
  'select': [{ assetId: string, imageId: string, url: string }]
}>()

const open = defineModel<boolean>('open', { default: false })

// Fetch assets
const url = computed(() => {
  const params = new URLSearchParams()
  if (props.assetType) params.set('type', props.assetType)
  if (props.projectId) params.set('projectId', props.projectId)
  const query = params.toString()
  return query ? `/api/assets?${query}` : '/api/assets'
})

const { data: assets, pending } = useFetch<AssetWithImages[]>(url, {
  watch: [url],
})

// Filter to only assets with at least one image
const assetsWithImages = computed(() => {
  if (!assets.value) return []
  return assets.value.filter(a => a.images && a.images.length > 0)
})

// Selected asset for expanded view
const selectedAsset = ref<AssetWithImages | null>(null)

function selectAsset(asset: AssetWithImages) {
  selectedAsset.value = asset
}

function selectImage(asset: AssetWithImages, image: AssetImage) {
  emit('select', {
    assetId: asset.id,
    imageId: image.id,
    url: getAssetImageUrl(asset.id, image.id),
  })
  open.value = false
  selectedAsset.value = null
}

function goBack() {
  selectedAsset.value = null
}

// Reset selection when modal closes
watch(open, (isOpen) => {
  if (!isOpen) {
    selectedAsset.value = null
  }
})
</script>

<template>
  <UModal v-model:open="open" :ui="{ content: 'sm:max-w-2xl' }">
    <template #content>
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <UButton
                v-if="selectedAsset"
                icon="i-lucide-arrow-left"
                variant="ghost"
                color="neutral"
                size="sm"
                @click="goBack"
              />
              <h3 class="text-lg font-semibold text-highlighted">
                {{ selectedAsset ? selectedAsset.name : 'Select Image' }}
              </h3>
            </div>
            <UButton
              icon="i-lucide-x"
              variant="ghost"
              color="neutral"
              size="sm"
              @click="open = false"
            />
          </div>
        </template>

        <!-- Loading state -->
        <div v-if="pending" class="flex items-center justify-center py-12">
          <UIcon name="i-lucide-loader-circle" class="size-8 text-muted animate-spin" />
        </div>

        <!-- Empty state -->
        <div v-else-if="!assetsWithImages.length" class="text-center py-12">
          <UIcon name="i-lucide-image-off" class="size-12 text-muted mx-auto mb-3" />
          <p class="text-muted">No images available</p>
          <p class="text-sm text-dimmed mt-1">Upload or generate images in the Assets section first.</p>
        </div>

        <!-- Asset detail view (show all images in selected asset) -->
        <div v-else-if="selectedAsset" class="space-y-4">
          <p class="text-sm text-muted">
            {{ selectedAsset.images.length }} image{{ selectedAsset.images.length === 1 ? '' : 's' }} in this asset
          </p>
          <div class="grid grid-cols-3 gap-3">
            <button
              v-for="image in selectedAsset.images"
              :key="image.id"
              class="aspect-square rounded-lg overflow-hidden border-2 border-transparent hover:border-primary transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
              @click="selectImage(selectedAsset, image)"
            >
              <img
                :src="getAssetImageUrl(selectedAsset.id, image.id)"
                :alt="image.prompt || 'Image'"
                class="w-full h-full object-cover"
              >
            </button>
          </div>
        </div>

        <!-- Asset grid view -->
        <div v-else class="grid grid-cols-3 gap-4">
          <button
            v-for="asset in assetsWithImages"
            :key="asset.id"
            class="group relative aspect-square rounded-lg overflow-hidden border-2 border-transparent hover:border-primary transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            @click="selectAsset(asset)"
          >
            <!-- Preview the first (most recent) image -->
            <img
              v-if="asset.images[0]"
              :src="getAssetImageUrl(asset.id, asset.images[0].id)"
              :alt="asset.name"
              class="w-full h-full object-cover"
            >
            <!-- Overlay with name and count -->
            <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2">
              <p class="text-white text-xs font-medium truncate">{{ asset.name }}</p>
              <p v-if="asset.images.length > 1" class="text-white/70 text-xs">
                {{ asset.images.length }} images
              </p>
            </div>
            <!-- Multi-image indicator -->
            <div
              v-if="asset.images.length > 1"
              class="absolute top-2 right-2 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded-full flex items-center gap-1"
            >
              <UIcon name="i-lucide-layers" class="size-3" />
              {{ asset.images.length }}
            </div>
          </button>
        </div>
      </UCard>
    </template>
  </UModal>
</template>
