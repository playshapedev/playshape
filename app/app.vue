<script setup lang="ts">
interface ElectronAPI {
  platform: string;
  isDev: boolean;
  appReady: () => void;
  inspectElement: (x: number, y: number) => void;
  setTrafficLightsVisible: (visible: boolean) => void;
  generateThumbnail: (args: {
    srcdoc: string;
    sfc: string;
    data: Record<string, unknown>;
    depMappings: Record<string, string>;
    brandCSS?: string;
    brandFontLink?: string;
  }) => Promise<string>;
}

const electronAPI = ref<ElectronAPI | null>(null);
const isElectron = computed(() => !!electronAPI.value);

// Right-click context menu — capture coordinates so "Inspect Element" targets the right spot
const contextMenuX = ref(0);
const contextMenuY = ref(0);

const contextMenuItems = computed(() => {
  const items: Array<
    Array<{ label: string; icon: string; onSelect: () => void }>
  > = [];

  if (electronAPI.value?.isDev) {
    items.push([
      {
        label: "Inspect Element",
        icon: "i-lucide-search-code",
        onSelect: () =>
          electronAPI.value?.inspectElement(
            contextMenuX.value,
            contextMenuY.value,
          ),
      },
    ]);
  }

  return items;
});

function onContextMenu(e: MouseEvent) {
  contextMenuX.value = e.clientX;
  contextMenuY.value = e.clientY;
}

onMounted(() => {
  window.addEventListener("contextmenu", onContextMenu);

  const api = (window as unknown as { electron?: ElectronAPI }).electron;
  if (api) {
    electronAPI.value = api;

    // Inject -webkit-app-region styles directly into the document head.
    // Tailwind v4 / Lightning CSS strips this as an unknown vendor prefix.
    const style = document.createElement("style");
    style.textContent = `
      .electron-drag { -webkit-app-region: drag; }
      .electron-no-drag, .electron-no-drag * { -webkit-app-region: no-drag; }
    `;
    document.head.appendChild(style);
  }
});

onUnmounted(() => {
  window.removeEventListener("contextmenu", onContextMenu);
});
</script>

<template>
  <UApp>
    <!-- Electron: drag region at the top of the window for window movement -->
    <div
      v-if="isElectron"
      class="electron-drag top-0 left-0 right-0 h-(--ui-titlebar-height)"
    />
    <!-- Right-click context menu (Electron dev mode) -->
    <UContextMenu v-if="contextMenuItems.length" :items="contextMenuItems">
      <NuxtLayout>
        <NuxtPage />
      </NuxtLayout>
    </UContextMenu>

    <template v-else>
      <NuxtLayout>
        <NuxtPage />
      </NuxtLayout>
    </template>

    <!-- Global background task notifications -->
    <BackgroundTaskPanel />
  </UApp>
</template>
