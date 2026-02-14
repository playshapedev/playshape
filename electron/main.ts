import { app, BrowserWindow, ipcMain, nativeImage, net } from 'electron'
import path from 'node:path'

// The built directory structure
//
// ├─┬ dist-electron/
// │ ├── main.js
// │ └── preload.js
// ├─┬ .output/public/
// │ └── index.html
//
process.env.DIST_ELECTRON = path.join(__dirname)
process.env.DIST = path.join(process.env.DIST_ELECTRON, '../.output/public')
process.env.BUILD = path.join(process.env.DIST_ELECTRON, '../build')

const APP_ICON = path.join(process.env.BUILD, 'icons', 'icon.png')

// Set the app name (used for dock hover, window title bar, etc.)
// Without this, Electron defaults to "Electron" in development.
app.name = 'Playshape'

let mainWindow: BrowserWindow | null = null

/**
 * Wait for the dev server to be ready before loading.
 * Retries every 300ms up to ~30 seconds.
 */
function waitForDevServer(url: string, maxRetries = 100): Promise<void> {
  return new Promise((resolve, reject) => {
    let attempts = 0
    const check = () => {
      attempts++
      const request = net.request(url)
      request.on('response', () => {
        resolve()
      })
      request.on('error', () => {
        if (attempts >= maxRetries) {
          reject(new Error(`Dev server not ready after ${attempts} attempts`))
        }
        else {
          setTimeout(check, 300)
        }
      })
      request.end()
    }
    check()
  })
}

async function createWindow() {
  const icon = nativeImage.createFromPath(APP_ICON)

  // On macOS the dock icon must be set explicitly during development
  // (in production, electron-builder sets the .icns in the app bundle)
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(icon)
  }

  const isMac = process.platform === 'darwin'

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Playshape',
    icon,
    show: false,
    backgroundColor: '#2E3086',

    // Native-feeling title bar:
    // macOS: hidden inset keeps traffic lights but removes the chrome title bar,
    //        letting the web content fill the entire window.
    // Windows: titleBarOverlay renders native window controls on top of web content.
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    ...(process.platform === 'win32' && {
      titleBarOverlay: {
        color: '#2E3086',
        symbolColor: '#ffffff',
        height: 40,
      },
    }),
    trafficLightPosition: isMac ? { x: 16, y: 12 } : undefined,

    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Show window once the Vue app signals it has rendered.
  // 'ready-to-show' fires too early (just the HTML shell), so we wait for
  // an IPC signal from the renderer after Vue has mounted.
  // Fallback timeout ensures the window always appears even if the signal
  // is missed (e.g. error during hydration).
  let shown = false
  const showWindow = () => {
    if (shown) return
    shown = true
    mainWindow?.show()
  }

  ipcMain.once('app-ready', showWindow)
  setTimeout(showWindow, 10000) // fallback: show after 10s no matter what

  // In development, load the Vite dev server URL
  // In production, load the built Nuxt output
  if (process.env.VITE_DEV_SERVER_URL) {
    await waitForDevServer(process.env.VITE_DEV_SERVER_URL)

    // In dev, Vite's dependency optimizer may not be ready when Electron first
    // loads the page, causing 504 "Outdated Optimize Dep" errors on dynamic
    // imports. Inject a handler into the page context that catches these and
    // auto-reloads. The window is still hidden, so the user never sees it.
    mainWindow.webContents.on('dom-ready', () => {
      mainWindow?.webContents.executeJavaScript(`
        if (!window.__electronDevReloadSetup) {
          window.__electronDevReloadSetup = true;
          window.addEventListener('unhandledrejection', (e) => {
            const msg = String(e.reason?.message || e.reason || '');
            if (msg.includes('Failed to fetch dynamically imported module') ||
                msg.includes('Outdated Optimize Dep')) {
              console.log('[electron] Vite deps not ready, reloading...');
              e.preventDefault();
              setTimeout(() => window.location.reload(), 1000);
            }
          });
          window.addEventListener('error', (e) => {
            const msg = String(e.message || '');
            if (msg.includes('Failed to fetch dynamically imported module') ||
                msg.includes('Outdated Optimize Dep')) {
              console.log('[electron] Vite deps not ready, reloading...');
              e.preventDefault();
              setTimeout(() => window.location.reload(), 1000);
            }
          });
        }
      `).catch(() => {})
    })

    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  }
  else {
    mainWindow.loadFile(path.join(process.env.DIST!, 'index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(createWindow)

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Re-create window on macOS when dock icon is clicked
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
