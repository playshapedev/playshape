<script setup lang="ts">
// Redirect to courses tab (the default project page)
const route = useRoute()
const projectId = route.params.id as string

await navigateTo(`/projects/${projectId}/courses`, { replace: true })
</script>

<template>
  <div />
</template>
