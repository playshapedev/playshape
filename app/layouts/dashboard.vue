<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const items: NavigationMenuItem[] = [
  {
    label: 'Projects',
    icon: 'i-lucide-folder-open',
    to: '/projects',
  },
  {
    label: 'Libraries',
    icon: 'i-lucide-library-big',
    to: '/libraries',
  },
  {
    label: 'Templates',
    icon: 'i-lucide-layout-template',
    to: '/templates',
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
const sidebarCollapsed = ref(false)

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
    <UDashboardSidebar
      v-model:collapsed="sidebarCollapsed"
      collapsible
      resizable
      :ui="{
        root: sidebarCollapsed ? 'border-e border-default [border-image:linear-gradient(to_bottom,transparent_var(--ui-header-height),var(--ui-border-default)_var(--ui-header-height))_1]' : undefined,
      }"
    >
      <template #header>
        <div class="electron-titlebar flex-1" :class="{ 'pt-10': isElectronMac }" />
      </template>

      <template #default="{ collapsed }">
        <UNavigationMenu
          :collapsed="collapsed"
          :items="items"
          orientation="vertical"
          highlight
        />
      </template>

      <template #footer="{ collapsed }">
        <div class="pb-3">
          <AppLogo :collapsed="collapsed" />
        </div>
      </template>
    </UDashboardSidebar>

    <slot />
  </UDashboardGroup>
</template>
