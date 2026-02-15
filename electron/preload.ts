// Preload script — runs in the renderer process with access to Node.js APIs
// before the web page loads. Used to safely expose native capabilities to the
// renderer via contextBridge.
//
// For now this is intentionally minimal. As IPC channels are added for
// native-only operations (file dialogs, OS keychain, window management),
// they will be exposed here via contextBridge.exposeInMainWorld().

import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electron', {
  platform: process.platform,
  /** Signal to the main process that the Vue app has rendered. */
  appReady: () => ipcRenderer.send('app-ready'),
})

// Mark the platform on <html> so CSS can apply platform-specific styles
// (e.g. titlebar inset for macOS hiddenInset title bar).
// This runs before the page renders, avoiding layout shift.
// Guard against null documentElement (can happen if preload runs before DOM is ready).
if (document.documentElement) {
  if (process.platform === 'darwin') {
    document.documentElement.classList.add('electron-mac')
  }
  else if (process.platform === 'win32') {
    document.documentElement.classList.add('electron-win')
  }
  document.documentElement.classList.add('electron')
}
