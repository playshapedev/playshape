<template>
  <div class="max-w-5xl">
    <UCard>
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-database" class="size-5" />
          <h3 class="font-semibold">Data & Storage</h3>
        </div>
      </template>
      <p class="text-sm text-muted">
        All your data is stored locally on this device. No cloud account required.
      </p>
      <template #footer>
        <UBadge label="Coming soon" variant="subtle" color="neutral" />
      </template>
    </UCard>
  </div>
</template>
