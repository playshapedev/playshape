<script setup lang="ts">
import logoSvg from '~/assets/playshape-logo.svg'

defineProps<{
  collapsed?: boolean
}>()
</script>

<template>
  <div class="flex items-center gap-2">
    <img :src="logoSvg" alt="Playshape" class="size-7 shrink-0">
    <span v-if="!collapsed" class="font-bold text-lg text-highlighted truncate">
      Playshape
    </span>
  </div>
</template>
