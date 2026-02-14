<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const items: NavigationMenuItem[] = [
  {
    label: 'Projects',
    icon: 'i-lucide-folder-open',
    to: '/projects',
  },
  {
    label: 'Settings',
    icon: 'i-lucide-settings',
    to: '/settings',
  },
]

// Detect if running in Electron on macOS (traffic lights need clearance)
const isElectronMac = ref(false)
const isElectron = ref(false)

onMounted(() => {
  const electron = (window as unknown as { electron?: { platform?: string } }).electron
  if (electron) {
    isElectron.value = true
    isElectronMac.value = electron.platform === 'darwin'
  }
})
</script>

<template>
  <UDashboardGroup>
    <UDashboardSidebar collapsible resizable>
      <template #header="{ collapsed }">
        <div class="titlebar-drag-region" :class="{ 'pt-10': isElectronMac }">
          <AppLogo :collapsed="collapsed" />
        </div>
      </template>

      <template #default="{ collapsed }">
        <UNavigationMenu
          :collapsed="collapsed"
          :items="items"
          orientation="vertical"
          highlight
        />
      </template>

      <template #footer>
        <UColorModeButton />
      </template>
    </UDashboardSidebar>

    <slot />
  </UDashboardGroup>
</template>

<style scoped>
.titlebar-drag-region {
  -webkit-app-region: drag;
}
.titlebar-drag-region :deep(a),
.titlebar-drag-region :deep(button) {
  -webkit-app-region: no-drag;
}
</style>
