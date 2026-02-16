<script setup lang="ts">
import type { Brand } from '~/composables/useBrands'

const props = defineProps<{
  brand: Brand
}>()

const emit = defineEmits<{
  edit: []
  delete: []
  setDefault: []
}>()

const menuItems = computed(() => [
  [
    {
      label: 'Edit',
      icon: 'i-lucide-pencil',
      onSelect: () => emit('edit'),
    },
    ...(!props.brand.isDefault
      ? [{
          label: 'Set as Default',
          icon: 'i-lucide-check-circle',
          onSelect: () => emit('setDefault'),
        }]
      : []),
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
        <!-- Color swatches -->
        <div class="flex gap-1 shrink-0">
          <div
            class="size-10 rounded-lg"
            :style="{ backgroundColor: brand.primaryColor }"
          />
          <div
            class="size-10 rounded-lg"
            :style="{ backgroundColor: brand.neutralColor }"
          />
          <div
            class="size-10 rounded-lg"
            :style="{ backgroundColor: brand.accentColor }"
          />
        </div>
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <h3 class="font-semibold truncate">{{ brand.name }}</h3>
            <UBadge
              v-if="brand.isDefault"
              label="Default"
              color="primary"
              variant="subtle"
              size="xs"
            />
          </div>
          <p class="text-sm text-muted truncate">
            {{ brand.fontFamily }} &middot; {{ brand.baseFontSize }}px
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
