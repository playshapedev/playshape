<script setup lang="ts">
function onThemeChange(value: string) {
  const colorMode = useColorMode()
  colorMode.preference = value
  // Reset any independent preview dark mode override so it follows the new theme
  localStorage.removeItem('playshape:preview-dark-mode')
  window.dispatchEvent(new CustomEvent('playshape:theme-reset'))
}
</script>

<template>
  <div class="max-w-5xl">
    <div class="mb-4">
      <h2 class="text-lg font-semibold">Appearance</h2>
      <p class="text-sm text-muted">Customize how Playshape looks.</p>
    </div>

    <UFormField label="Theme">
      <USelectMenu
        :model-value="$colorMode.preference"
        :items="[
          { label: 'System', value: 'system' },
          { label: 'Light', value: 'light' },
          { label: 'Dark', value: 'dark' },
        ]"
        value-key="value"
        class="w-48"
        @update:model-value="onThemeChange"
      />
    </UFormField>
  </div>
</template>
