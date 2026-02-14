/**
 * Signals to the Electron main process that the Vue app has rendered.
 * This runs client-side only (.client.ts) after the app has mounted,
 * so the main process can safely show the window with content visible.
 */
export default defineNuxtPlugin({
  hooks: {
    'app:mounted'() {
      if ('electron' in window) {
        const electron = (window as unknown as { electron: { appReady?: () => void } }).electron
        electron.appReady?.()
      }
    },
  },
})
