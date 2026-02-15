<script setup lang="ts">
const projectId = inject<string>('projectId')!
const toast = useToast()

const { libraries: linkedLibraries, pending: librariesPending, refresh: refreshLinkedLibraries } = useProjectLibraries(projectId)
const { libraries: allLibraries, refresh: refreshAllLibraries } = useLibraries()

// ─── Library linking ─────────────────────────────────────────────────────────

const showLinkModal = ref(false)
const linking = ref(false)

const linkedIds = computed(() => new Set(linkedLibraries.value?.map(l => l.id) ?? []))

const availableLibraries = computed(() =>
  allLibraries.value?.filter(l => !linkedIds.value.has(l.id)) ?? [],
)

async function handleLink(libraryId: string) {
  linking.value = true
  try {
    await linkLibrary(projectId, libraryId)
    await refreshLinkedLibraries()
    toast.add({ title: 'Library linked', color: 'success' })
  }
  catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    toast.add({ title: 'Failed to link library', description: message, color: 'error' })
  }
  finally {
    linking.value = false
  }
}

async function handleUnlink(libraryId: string) {
  try {
    await unlinkLibrary(projectId, libraryId)
    await refreshLinkedLibraries()
    toast.add({ title: 'Library unlinked', color: 'success' })
  }
  catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    toast.add({ title: 'Failed to unlink library', description: message, color: 'error' })
  }
}

function openLinkModal() {
  refreshAllLibraries()
  showLinkModal.value = true
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h3 class="text-sm font-medium text-muted uppercase tracking-wide">
        Linked Libraries
      </h3>
      <UButton
        label="Link Library"
        icon="i-lucide-plus"
        size="sm"
        variant="soft"
        @click="openLinkModal"
      />
    </div>

    <div v-if="librariesPending" class="flex items-center justify-center py-8">
      <UIcon name="i-lucide-loader-2" class="size-5 animate-spin text-muted" />
    </div>

    <EmptyState
      v-else-if="!linkedLibraries?.length"
      icon="i-lucide-library-big"
      title="No libraries linked"
      description="Link a library to this project so its content can be used when generating activities."
    >
      <UButton
        label="Link Library"
        icon="i-lucide-plus"
        @click="openLinkModal"
      />
    </EmptyState>

    <div v-else class="space-y-2">
      <div
        v-for="lib in linkedLibraries"
        :key="lib.id"
        class="flex items-center gap-3 p-3 rounded-lg border border-default group"
      >
        <UIcon name="i-lucide-library-big" class="size-5 text-primary shrink-0" />
        <div class="flex-1 min-w-0">
          <NuxtLink
            :to="`/libraries/${lib.id}`"
            class="font-medium text-highlighted hover:underline truncate block"
          >
            {{ lib.name }}
          </NuxtLink>
          <p class="text-xs text-dimmed">
            {{ lib.documentCount ?? 0 }} {{ (lib.documentCount ?? 0) === 1 ? 'document' : 'documents' }}
          </p>
        </div>
        <UButton
          icon="i-lucide-unlink"
          color="neutral"
          variant="ghost"
          size="xs"
          class="opacity-0 group-hover:opacity-100 transition-opacity"
          @click="handleUnlink(lib.id)"
        />
      </div>
    </div>
  </div>

  <!-- Link library modal -->
  <UModal v-model:open="showLinkModal">
    <template #header>
      <h3 class="text-lg font-semibold">Link a Library</h3>
    </template>
    <template #body>
      <div v-if="!availableLibraries.length" class="py-4 text-center">
        <p class="text-muted">No more libraries available to link.</p>
        <NuxtLink to="/libraries" class="text-sm text-primary hover:underline mt-2 inline-block">
          Create a new library
        </NuxtLink>
      </div>
      <div v-else class="space-y-2">
        <div
          v-for="lib in availableLibraries"
          :key="lib.id"
          class="flex items-center gap-3 p-3 rounded-lg border border-default hover:border-primary/50 cursor-pointer transition-colors"
          @click="handleLink(lib.id)"
        >
          <UIcon name="i-lucide-library-big" class="size-5 text-muted shrink-0" />
          <div class="flex-1 min-w-0">
            <p class="font-medium text-highlighted truncate">{{ lib.name }}</p>
            <p v-if="lib.description" class="text-xs text-dimmed truncate">{{ lib.description }}</p>
          </div>
          <UIcon name="i-lucide-plus" class="size-4 text-muted shrink-0" />
        </div>
      </div>
    </template>
  </UModal>
</template>
