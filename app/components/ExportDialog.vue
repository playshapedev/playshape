<script setup lang="ts">
/**
 * ExportDialog — SCORM export modal for courses
 *
 * Allows users to select SCORM version and export settings,
 * then downloads the SCORM ZIP package.
 */

const props = defineProps<{
  projectId: string
  courseId: string
  courseName: string
}>()

const open = defineModel<boolean>('open', { default: false })
const toast = useToast()

// Form state
const scormVersion = ref<'scorm-1.2' | 'scorm-2004'>('scorm-1.2')
const offlineMode = ref(false)
const exporting = ref(false)

const scormVersionOptions = [
  { label: 'SCORM 1.2', value: 'scorm-1.2', description: 'Universal LMS support' },
  { label: 'SCORM 2004 (3rd Edition)', value: 'scorm-2004', description: 'Enhanced tracking' },
]

async function handleExport() {
  exporting.value = true

  try {
    // Fetch the ZIP as a blob
    const response = await $fetch.raw<Blob>(
      `/api/projects/${props.projectId}/courses/${props.courseId}/export`,
      {
        method: 'POST',
        body: {
          format: scormVersion.value,
          offline: offlineMode.value,
        },
        responseType: 'blob',
      },
    )

    // Get filename from Content-Disposition header or generate one
    const contentDisposition = response.headers.get('content-disposition')
    let filename = `${props.courseName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-scorm.zip`
    if (contentDisposition) {
      const match = contentDisposition.match(/filename="?([^";\n]+)"?/)
      if (match?.[1]) filename = match[1]
    }

    // Trigger download
    const blob = response._data
    if (blob) {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }

    toast.add({
      title: 'Export complete',
      description: `Downloaded ${filename}`,
      color: 'success',
      icon: 'i-lucide-check',
    })

    open.value = false
  }
  catch (error) {
    console.error('Export failed:', error)
    toast.add({
      title: 'Export failed',
      description: error instanceof Error ? error.message : 'An error occurred while exporting',
      color: 'error',
      icon: 'i-lucide-alert-circle',
    })
  }
  finally {
    exporting.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open">
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-package" class="size-5 text-primary" />
        <h3 class="text-lg font-semibold">Export as SCORM</h3>
      </div>
    </template>

    <template #body>
      <div class="space-y-6">
        <!-- SCORM Version -->
        <div class="space-y-3">
          <label class="text-sm font-medium">SCORM Version</label>
          <URadioGroup v-model="scormVersion" :items="scormVersionOptions">
            <template #label="{ item }">
              <div>
                <div class="font-medium">{{ item.label }}</div>
                <div class="text-xs text-muted">{{ item.description }}</div>
              </div>
            </template>
          </URadioGroup>
        </div>

        <!-- Offline Mode (disabled for now) -->
        <!--
        <UCheckbox v-model="offlineMode" label="Offline mode">
          <template #description>
            Bundle all dependencies (~700KB larger) for networks that block CDN access
          </template>
        </UCheckbox>
        -->

        <!-- Info -->
        <UAlert
          color="info"
          variant="subtle"
          icon="i-lucide-info"
          title="About SCORM export"
        >
          <template #description>
            Your course will be packaged as a single-SCO SCORM package. All activities and navigation
            are bundled into one HTML file. Upload the ZIP to any LMS that supports SCORM.
          </template>
        </UAlert>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton
          label="Cancel"
          color="neutral"
          variant="ghost"
          :disabled="exporting"
          @click="open = false"
        />
        <UButton
          label="Export"
          icon="i-lucide-download"
          :loading="exporting"
          @click="handleExport"
        />
      </div>
    </template>
  </UModal>
</template>
