<script setup lang="ts">
import type { Template } from '~/composables/useTemplates'

const { templates: allTemplates, pending } = useTemplates('interface')

// Split templates into user-created and defaults
const userTemplates = computed(() =>
  (allTemplates.value || []).filter(t => t.source !== 'default'),
)
const defaultTemplates = computed(() =>
  (allTemplates.value || []).filter(t => t.source === 'default'),
)

const showCreateModal = ref(false)
const newTemplateName = ref('')
const newTemplateDescription = ref('')
const creating = ref(false)
const copying = ref(false)

const toast = useToast()
const router = useRouter()

async function handleCreate() {
  if (!newTemplateName.value.trim()) return
  creating.value = true
  try {
    const template = await createTemplate({
      name: newTemplateName.value.trim(),
      description: newTemplateDescription.value.trim(),
      kind: 'interface',
    })
    showCreateModal.value = false
    newTemplateName.value = ''
    newTemplateDescription.value = ''
    toast.add({ title: 'Interface created', color: 'success' })
    // Clear the templates list cache so it shows the new interface when navigating back
    await clearNuxtData(getTemplatesKey('interface'))
    await router.push(`/templates/${template.id}`)
  }
  catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    toast.add({ title: 'Failed to create interface', description: message, color: 'error' })
  }
  finally {
    creating.value = false
  }
}

async function handleUseTemplate(tmpl: Template) {
  if (copying.value) return
  copying.value = true
  try {
    const copy = await copyTemplate(tmpl.id)
    toast.add({ title: `Created from "${tmpl.name}"`, color: 'success' })
    await clearNuxtData(getTemplatesKey('interface'))
    await router.push(`/templates/${copy.id}`)
  }
  catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    toast.add({ title: 'Failed to create copy', description: message, color: 'error' })
  }
  finally {
    copying.value = false
  }
}
</script>

<template>
  <!-- Navbar actions -->
  <Teleport defer to="#navbar-actions">
    <UButton
      label="New Interface"
      icon="i-lucide-plus"
      @click="showCreateModal = true"
    />
  </Teleport>

  <!-- Loading -->
  <div v-if="pending" class="flex items-center justify-center py-12">
    <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-muted" />
  </div>

  <!-- Empty state (no templates at all — user or default) -->
  <EmptyState
    v-else-if="!allTemplates?.length"
    icon="i-lucide-panel-top"
    title="No interfaces yet"
    description="Create course navigation wrappers that handle branding, lesson titles, and activity navigation."
  >
    <UButton
      label="Create Interface"
      icon="i-lucide-plus"
      @click="showCreateModal = true"
    />
  </EmptyState>

  <div v-else class="space-y-8">
    <!-- User templates -->
    <div v-if="userTemplates.length" class="space-y-4">
      <h2 v-if="defaultTemplates.length" class="text-sm font-medium text-muted uppercase tracking-wide">
        My Interfaces
      </h2>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <TemplateCard
          v-for="tmpl in userTemplates"
          :key="tmpl.id"
          :template="tmpl"
        />
      </div>
    </div>

    <!-- Default templates -->
    <div v-if="defaultTemplates.length" class="space-y-4">
      <h2 class="text-sm font-medium text-muted uppercase tracking-wide">
        Default Interfaces
      </h2>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <TemplateCard
          v-for="tmpl in defaultTemplates"
          :key="tmpl.id"
          :template="tmpl"
          @use-template="handleUseTemplate"
        />
      </div>
    </div>
  </div>

  <!-- Create modal -->
  <UModal v-model:open="showCreateModal">
    <template #header>
      <h3 class="text-lg font-semibold">New Interface</h3>
    </template>
    <template #body>
      <div class="space-y-4">
        <UFormField label="Name" required>
          <UInput
            v-model="newTemplateName"
            placeholder="e.g. Course Player, Lesson Navigator"
            autofocus
            @keydown.enter="handleCreate"
          />
        </UFormField>
        <UFormField label="Description">
          <UTextarea
            v-model="newTemplateDescription"
            placeholder="Brief description of this interface..."
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
          :disabled="!newTemplateName.trim()"
          @click="handleCreate"
        />
      </div>
    </template>
  </UModal>
</template>
