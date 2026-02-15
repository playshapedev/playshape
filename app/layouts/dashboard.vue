<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'
import { navigation, resolveNavItem } from '~/utils/navigation'
import type { NavTab } from '~/utils/navigation'

const route = useRoute()
const nuxtApp = useNuxtApp()

// ── Sidebar navigation items (derived from nav structure) ───────────────────
const sidebarItems: NavigationMenuItem[] = navigation.map(item => ({
  label: item.title,
  icon: item.icon,
  to: item.path,
}))

// ── Navbar: resolve current page from navigation structure ──────────────────
const { titleOverride, tabsOverride, setTitle, setTabs } = useNavbar()

// Pages can set `noPadding: true` in definePageMeta to remove body padding.
const noPadding = computed(() => !!route.meta.noPadding)

const navItem = computed(() => resolveNavItem(route.path))
const navTitle = computed(() => titleOverride.value ?? navItem.value.item?.title ?? '')
const navParent = computed(() => navItem.value.parent)

// ── Tabbed navigation ───────────────────────────────────────────────────────
// Tabs come from the navigation structure or can be overridden by the page.
const navTabs = computed(() => {
  if (tabsOverride.value !== null) return tabsOverride.value as NavTab[]
  return navItem.value.item?.tabs ?? []
})

// Build the base path for tab hrefs by matching the nav pattern against the
// current route. E.g. pattern '/projects/:id' + route '/projects/abc/libraries'
// → base path '/projects/abc'
const tabBasePath = computed(() => {
  const item = navItem.value.item
  if (!item) return ''
  const patternSegments = item.path.split('/').length
  return route.path.split('/').slice(0, patternSegments).join('/')
})

function tabHref(tab: NavTab): string {
  if (!tab.path) return tabBasePath.value
  return `${tabBasePath.value}/${tab.path}`
}

function isTabActive(tab: NavTab): boolean {
  return route.path === tabHref(tab)
}

// Clear title and tabs overrides on route change — but only when navigating
// to a different base path, not between sibling tabs within the same page.
let lastBasePath = ''
watch(() => route.path, () => {
  const currentBase = tabBasePath.value
  if (currentBase !== lastBasePath) {
    setTitle(null)
    setTabs(null)
  }
  lastBasePath = currentBase

  // Close the unpinned overlay sidebar on navigation (lg+ only).
  // The small viewport slideover auto-closes via DashboardSidebar's own route watcher.
  if (!isSmallViewport.value && !sidebarPinned.value && sidebarHovered.value) {
    sidebarHovered.value = false
    clearHideTimeout()
  }
})

// ── Responsive: track viewport size ─────────────────────────────────────────
// Below lg (1024px) the sidebar uses Nuxt UI's built-in slideover.
// At lg+ we use our custom pin/unpin overlay behavior.
const LG_BREAKPOINT = 1024
const isSmallViewport = ref(false)

let mediaQuery: MediaQueryList | null = null

function onMediaChange(e: MediaQueryListEvent | MediaQueryList) {
  isSmallViewport.value = !e.matches
}

// When crossing from large → small, force unpin so the sidebar doesn't get stuck
watch(isSmallViewport, (small) => {
  if (small && sidebarPinned.value) {
    sidebarPinned.value = false
    sidebarHovered.value = false
    clearHideTimeout()
  }
})

// ── Sidebar pin/unpin state (lg+ only) ──────────────────────────────────────
// Pinned: sidebar is in normal flow, resizable. User can drag it smaller to unpin.
// Unpinned: sidebar is hidden off-screen, revealed as an overlay on hover.
const sidebarPinned = ref(true)
const sidebarCollapsed = ref(false)
const sidebarHovered = ref(false)

// Track Nuxt UI's built-in slideover open state (for small viewports)
const sidebarOpen = ref(false)

// Persist pinned state in localStorage
watch(sidebarPinned, (val) => {
  localStorage.setItem('dashboard-sidebar-pinned', String(val))
})

// Delay timer to prevent flicker when mouse briefly leaves sidebar
let hideTimeout: ReturnType<typeof setTimeout> | null = null

function clearHideTimeout() {
  if (hideTimeout) {
    clearTimeout(hideTimeout)
    hideTimeout = null
  }
}

function scheduleHide() {
  clearHideTimeout()
  hideTimeout = setTimeout(() => {
    sidebarHovered.value = false
    hideTimeout = null
  }, 300)
}

// ── Mouse tracking for overlay sidebar (lg+ only) ──────────────────────────
// We can't rely solely on mouseleave because the Electron drag bar (z-[9999])
// sits above the sidebar and intercepts pointer events. Moving the mouse into
// the drag bar area above the sidebar fires mouseleave even though the cursor
// is visually still "over" the sidebar. Instead, we track mousemove globally
// and check whether the cursor is within the sidebar's bounding rect.
function onGlobalMouseMove(e: MouseEvent) {
  // Ignore events at the viewport edge — the mouse is leaving the window.
  // Don't close the sidebar when the user slides their cursor off-screen.
  const margin = 10
  if (
    e.clientX <= margin
    || e.clientY <= margin
    || e.clientX >= window.innerWidth - margin
    || e.clientY >= window.innerHeight - margin
  ) {
    clearHideTimeout()
    return
  }

  // ── Small viewport: track the built-in slideover ────────────────────────
  if (isSmallViewport.value) {
    if (!sidebarOpen.value) return

    // The slideover content is rendered in a portal — find it by data attributes
    const el = document.querySelector<HTMLElement>('[data-slot="content"][data-side="left"]')
    if (!el) return

    const rect = el.getBoundingClientRect()
    const inside = e.clientX >= rect.left && e.clientX <= rect.right
      && e.clientY >= rect.top && e.clientY <= rect.bottom

    if (inside) {
      clearHideTimeout()
    }
    else if (!hideTimeout) {
      clearHideTimeout()
      hideTimeout = setTimeout(() => {
        sidebarOpen.value = false
        hideTimeout = null
      }, 300)
    }
    return
  }

  // ── Large viewport: track the custom overlay sidebar ────────────────────
  if (sidebarPinned.value || !sidebarHovered.value) return

  const el = document.querySelector<HTMLElement>('.sidebar-overlay')
  if (!el) return

  const rect = el.getBoundingClientRect()
  const insideX = e.clientX >= rect.left && e.clientX <= rect.right
  const insideY = e.clientY >= rect.top && e.clientY <= rect.bottom

  if (insideX && insideY) {
    clearHideTimeout()
  }
  else if (!hideTimeout) {
    scheduleHide()
  }
}

// ── Keyboard shortcut ───────────────────────────────────────────────────────
// Cmd+S (macOS) / Ctrl+S (other) toggles sidebar
function onKeyDown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === 's') {
    e.preventDefault()
    handleToggle()
  }
}

onMounted(() => {
  // Responsive breakpoint listener
  mediaQuery = window.matchMedia(`(min-width: ${LG_BREAKPOINT}px)`)
  onMediaChange(mediaQuery)
  mediaQuery.addEventListener('change', onMediaChange)

  // Restore persisted pinned state (only matters at lg+)
  const stored = localStorage.getItem('dashboard-sidebar-pinned')
  if (stored !== null && !isSmallViewport.value) {
    sidebarPinned.value = stored === 'true'
  }
  else if (isSmallViewport.value) {
    sidebarPinned.value = false
  }

  window.addEventListener('mousemove', onGlobalMouseMove)
  window.addEventListener('keydown', onKeyDown)
})

onUnmounted(() => {
  mediaQuery?.removeEventListener('change', onMediaChange)
  window.removeEventListener('mousemove', onGlobalMouseMove)
  window.removeEventListener('keydown', onKeyDown)
  clearHideTimeout()
})

// When user drags sidebar small enough to collapse, transition to unpinned mode
watch(sidebarCollapsed, (collapsed) => {
  if (collapsed && sidebarPinned.value) {
    sidebarPinned.value = false
    nextTick(() => {
      sidebarCollapsed.value = false
    })
  }
})

// Key used to force-remount UDashboardSidebar, resetting its internal
// useResizable state (persisted size) back to defaultSize.
const sidebarKey = ref(0)

function pinSidebar() {
  // Bump the key to remount the sidebar with a fresh default size.
  // Without this, the sidebar reopens at the tiny size it was at when
  // it collapsed, making it impossible to grab the resize handle.
  sidebarKey.value++

  sidebarPinned.value = true
  sidebarHovered.value = false
  clearHideTimeout()
}

function unpinSidebar() {
  sidebarPinned.value = false
  sidebarHovered.value = false
}

// ── Unified toggle handler ──────────────────────────────────────────────────
// Below lg: opens/closes Nuxt UI's built-in slideover via the runtime hook.
// At lg+: toggles our custom pin/unpin overlay behavior.
function handleToggle() {
  if (isSmallViewport.value) {
    nuxtApp.hooks.callHook('dashboard:sidebar:toggle')
  }
  else if (sidebarPinned.value) {
    unpinSidebar()
  }
  else {
    pinSidebar()
  }
}

// ── Hover trigger handler ───────────────────────────────────────────────────
// Below lg: open the built-in slideover.
// At lg+: show the custom overlay.
function onTriggerEnter() {
  if (isSmallViewport.value) {
    if (!sidebarOpen.value) {
      nuxtApp.hooks.callHook('dashboard:sidebar:toggle')
    }
  }
  else {
    if (sidebarPinned.value) return
    clearHideTimeout()
    sidebarHovered.value = true
  }
}

// ── Navbar toggle button icon ───────────────────────────────────────────────
const toggleIcon = computed(() => {
  if (isSmallViewport.value) return 'i-lucide-menu'
  return sidebarPinned.value ? 'i-lucide-panel-left-close' : 'i-lucide-panel-left-open'
})

// ── Sidebar visibility ──────────────────────────────────────────────────────
const sidebarVisible = computed(() => {
  if (isSmallViewport.value) return sidebarOpen.value
  return sidebarPinned.value || sidebarHovered.value
})

// Provide sidebar visibility so child components (e.g. ProviderSwitcher) can
// react when the sidebar hides — closing menus, dropdowns, etc.
provide('sidebarVisible', sidebarVisible)

// ── macOS traffic lights ────────────────────────────────────────────────────

let trafficLightTimeout: ReturnType<typeof setTimeout> | null = null

watch(sidebarVisible, (visible) => {
  const electron = (window as unknown as { electron?: { platform: string, setTrafficLightsVisible: (v: boolean) => void } }).electron
  if (electron?.platform !== 'darwin') return

  if (trafficLightTimeout) {
    clearTimeout(trafficLightTimeout)
    trafficLightTimeout = null
  }

  if (visible) {
    // Delay showing so the slide animation is already underway
    trafficLightTimeout = setTimeout(() => {
      electron.setTrafficLightsVisible(true)
      trafficLightTimeout = null
    }, 100)
  }
  else {
    electron.setTrafficLightsVisible(false)
  }
})
</script>

<template>
  <UDashboardGroup unit="px">
    <!-- Hover trigger zone: invisible strip at left edge when sidebar is not visible -->
    <div
      v-if="!sidebarPinned || isSmallViewport"
      class="sidebar-trigger electron-no-drag"
      @mouseenter="onTriggerEnter"
    />

    <UDashboardSidebar
      :key="sidebarKey"
      v-model:open="sidebarOpen"
      v-model:collapsed="sidebarCollapsed"
      :toggle="false"
      :collapsible="sidebarPinned && !isSmallViewport"
      :resizable="sidebarPinned && !isSmallViewport"
      :min-size="200"
      :max-size="400"
      :default-size="280"
      :collapsed-size="190"
      :menu="{ overlay: false, close: false }"
      :ui="{ content: 'max-w-[280px]' }"
      :class="[
        !isSmallViewport && !sidebarPinned && 'sidebar-overlay',
        !isSmallViewport && !sidebarPinned && sidebarHovered && 'sidebar-overlay-visible',
      ]"
    >
      <template #header />

      <template #default>
        <UNavigationMenu
          :items="sidebarItems"
          orientation="vertical"
          highlight
        />
      </template>

      <template #footer>
        <div class="min-w-0 w-full space-y-2 pb-3">
          <ProviderSwitcher />
          <AppLogo />
        </div>
      </template>
    </UDashboardSidebar>

    <!-- Main content area with navbar -->
    <div class="flex flex-1 min-w-0">
      <UDashboardPanel :ui="noPadding ? { body: 'p-0 sm:p-0 gap-0 sm:gap-0' } : undefined">
        <template #header>
          <UDashboardNavbar :title="navTitle" :toggle="false" :ui="navTabs.length ? { root: 'border-b-0' } : undefined">
            <template #leading>
              <UButton
                :icon="toggleIcon"
                variant="ghost"
                color="neutral"
                size="sm"
                class="electron-no-drag"
                @click="handleToggle"
              />
              <!-- Back button for detail/child pages -->
              <UButton
                v-if="navParent"
                class="electron-no-drag"
                icon="i-lucide-arrow-left"
                color="neutral"
                variant="ghost"
                size="sm"
                :to="navParent.path"
              />
            </template>
            <template #right>
              <!-- Teleport target: pages inject their navbar actions here -->
              <div id="navbar-actions" class="contents electron-no-drag" />
            </template>
          </UDashboardNavbar>

          <!-- Tabbed navigation below navbar -->
          <nav v-if="navTabs.length" class="flex items-center gap-0.5 px-4 sm:px-6 border-b border-default">
            <NuxtLink
              v-for="tab in navTabs"
              :key="tab.path"
              :to="tabHref(tab)"
              class="relative flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors"
              :class="[
                isTabActive(tab)
                  ? 'text-highlighted'
                  : 'text-muted hover:text-default',
              ]"
            >
              <UIcon v-if="tab.icon" :name="tab.icon" class="size-3.5" />
              {{ tab.label }}
              <!-- Active indicator -->
              <span
                v-if="isTabActive(tab)"
                class="absolute bottom-0 inset-x-3 h-0.5 rounded-full bg-primary"
              />
            </NuxtLink>
          </nav>
        </template>

        <template #body>
          <slot />
        </template>
      </UDashboardPanel>
    </div>
  </UDashboardGroup>
</template>
