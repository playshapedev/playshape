<script setup lang="ts">
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
        @update:model-value="$colorMode.preference = $event"
      />
    </UFormField>
  </div>
</template>
