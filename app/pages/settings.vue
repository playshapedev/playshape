<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar title="Settings">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-6 max-w-2xl">
        <UCard>
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-bot" class="size-5" />
              <h3 class="font-semibold">LLM Provider</h3>
            </div>
          </template>
          <p class="text-sm text-muted">
            Configure your LLM provider to enable AI-powered activity generation. Supports Ollama, LM Studio, OpenAI, and Anthropic.
          </p>
          <template #footer>
            <UBadge label="Coming soon" variant="subtle" color="neutral" />
          </template>
        </UCard>

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
  </UDashboardPanel>
</template>
