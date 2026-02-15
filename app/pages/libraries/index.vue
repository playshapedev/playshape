<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })

const { libraries, pending, refresh } = useLibraries()

const showCreateModal = ref(false)
const newLibraryName = ref('')
const newLibraryDescription = ref('')
const creating = ref(false)

const toast = useToast()

async function handleCreate() {
  if (!newLibraryName.value.trim()) return
  creating.value = true
  try {
    await createLibrary({
      name: newLibraryName.value.trim(),
      description: newLibraryDescription.value.trim(),
    })
    showCreateModal.value = false
    newLibraryName.value = ''
    newLibraryDescription.value = ''
    await refresh()
    toast.add({ title: 'Library created', color: 'success' })
  }
  catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    toast.add({ title: 'Failed to create library', description: message, color: 'error' })
  }
  finally {
    creating.value = false
  }
}
</script>

<template>
  <div class="flex flex-1 min-w-0">
    <UDashboardPanel>
      <template #header>
        <UDashboardNavbar title="Libraries">
          <template #leading>
            <UDashboardSidebarCollapse />
          </template>
          <template #right>
            <UButton
              label="New Library"
              icon="i-lucide-plus"
              @click="showCreateModal = true"
            />
          </template>
        </UDashboardNavbar>
      </template>

      <template #body>
        <!-- Loading -->
        <div v-if="pending" class="flex items-center justify-center py-12">
          <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-muted" />
        </div>

        <!-- Empty state -->
        <EmptyState
          v-else-if="!libraries?.length"
          icon="i-lucide-library-big"
          title="No libraries yet"
          description="Create a library to organize your source content for generating practice activities."
        >
          <UButton
            label="Create Library"
            icon="i-lucide-plus"
            @click="showCreateModal = true"
          />
        </EmptyState>

        <!-- Library grid -->
        <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <LibraryCard
            v-for="library in libraries"
            :key="library.id"
            :library="library"
          />
        </div>
      </template>
    </UDashboardPanel>

    <!-- Create modal -->
    <UModal v-model:open="showCreateModal">
      <template #header>
        <h3 class="text-lg font-semibold">New Library</h3>
      </template>
      <template #body>
        <div class="space-y-4">
          <UFormField label="Name" required>
            <UInput
              v-model="newLibraryName"
              placeholder="e.g. Product Knowledge, Company Policies"
              autofocus
              @keydown.enter="handleCreate"
            />
          </UFormField>
          <UFormField label="Description">
            <UTextarea
              v-model="newLibraryDescription"
              placeholder="What kind of content will this library contain?"
              :rows="3"
            />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton
            label="Cancel"
            color="neutral"
            variant="ghost"
            @click="showCreateModal = false"
          />
          <UButton
            label="Create"
            :loading="creating"
            :disabled="!newLibraryName.trim()"
            @click="handleCreate"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
