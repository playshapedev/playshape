<script setup lang="ts">
const toast = useToast()
const isDeleting = ref(false)
const showDeleteModal = ref(false)
const isDev = import.meta.dev

async function handleDeleteEverything() {
  isDeleting.value = true
  try {
    await $fetch('/api/admin/reset', { method: 'DELETE' })
    showDeleteModal.value = false
    toast.add({
      title: 'Content deleted',
      description: 'All content has been deleted. Redirecting...',
      color: 'success',
    })
    // Redirect to home after a brief delay
    setTimeout(() => {
      navigateTo('/')
    }, 1500)
  }
  catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete data'
    toast.add({
      title: 'Error',
      description: message,
      color: 'error',
    })
  }
  finally {
    isDeleting.value = false
  }
}
</script>

<template>
  <div class="max-w-5xl space-y-6">
    <UCard>
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-database" class="size-5" />
          <h3 class="font-semibold">Data & Storage</h3>
        </div>
      </template>
      <p class="text-sm text-muted">
        All your data is stored locally on this device. No cloud account required.
      </p>
      <template #footer>
        <UBadge label="Coming soon" variant="subtle" color="neutral" />
      </template>
    </UCard>

    <!-- Danger Zone (dev only) -->
    <UCard v-if="isDev" class="border-error/50">
      <template #header>
        <div class="flex items-center gap-2 text-error">
          <UIcon name="i-lucide-alert-triangle" class="size-5" />
          <h3 class="font-semibold">Danger Zone</h3>
        </div>
      </template>
      <div class="space-y-4">
        <p class="text-sm text-muted">
          These actions are destructive and cannot be undone. Only available in development mode.
        </p>
        <div class="flex items-center justify-between p-4 rounded-lg bg-error/5 border border-error/20">
          <div>
            <p class="font-medium">Delete All Content</p>
            <p class="text-sm text-muted">
              Remove all projects, templates, libraries, and assets. AI providers and settings are preserved.
            </p>
          </div>
          <UButton
            color="error"
            variant="solid"
            icon="i-lucide-trash-2"
            @click="showDeleteModal = true"
          >
            Delete All Data
          </UButton>
        </div>
      </div>
    </UCard>

    <!-- Delete Confirmation Modal -->
    <UModal v-model:open="showDeleteModal">
      <template #content>
        <UCard>
          <template #header>
            <div class="flex items-center gap-2 text-error">
              <UIcon name="i-lucide-alert-triangle" class="size-5" />
              <h3 class="font-semibold">Delete All Content</h3>
            </div>
          </template>

          <div class="space-y-4">
            <p>
              This will permanently delete all your content:
            </p>
            <ul class="list-disc list-inside text-sm text-muted space-y-1">
              <li>All projects and courses</li>
              <li>All templates (activity and interface)</li>
              <li>All libraries and documents</li>
              <li>All assets (images and videos)</li>
              <li>All chat histories</li>
            </ul>
            <p class="text-sm text-muted">
              Your AI providers, models, API keys, and app settings will be preserved.
            </p>
            <p class="font-medium text-error">
              This action cannot be undone.
            </p>
          </div>

          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton
                variant="ghost"
                color="neutral"
                :disabled="isDeleting"
                @click="showDeleteModal = false"
              >
                Cancel
              </UButton>
              <UButton
                color="error"
                icon="i-lucide-trash-2"
                :loading="isDeleting"
                @click="handleDeleteEverything"
              >
                Delete Everything
              </UButton>
            </div>
          </template>
        </UCard>
      </template>
    </UModal>
  </div>
</template>
