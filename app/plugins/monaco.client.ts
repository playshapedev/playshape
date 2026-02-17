/**
 * Configure Monaco editor loader to use CDN.
 * This runs client-side only (.client.ts) and sets up the loader
 * before any Monaco components are mounted.
 */
import { loader } from '@guolao/vue-monaco-editor'

export default defineNuxtPlugin(() => {
  // Configure Monaco to load from CDN
  // Using the same version as our activity tools (0.52.2)
  loader.config({
    paths: {
      vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs',
    },
  })
})
