<script setup lang="ts">
withDefaults(defineProps<{
  title?: string
  description?: string
  confirmLabel?: string
  confirmColor?: string
  cancelLabel?: string
  loading?: boolean
}>(), {
  title: 'Confirm',
  description: 'Are you sure?',
  confirmLabel: 'Confirm',
  confirmColor: 'error',
  cancelLabel: 'Cancel',
  loading: false,
})

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{
  confirm: []
}>()
</script>

<template>
  <UModal v-model:open="open">
    <template #header>
      <h3 class="text-lg font-semibold">{{ title }}</h3>
    </template>
    <template #body>
      <p class="text-sm text-muted">{{ description }}</p>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton
          :label="cancelLabel"
          color="neutral"
          variant="ghost"
          @click="open = false"
        />
        <UButton
          :label="confirmLabel"
          :color="confirmColor"
          :loading="loading"
          @click="emit('confirm')"
        />
      </div>
    </template>
  </UModal>
</template>
