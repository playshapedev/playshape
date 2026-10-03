import { app, BrowserWindow, ipcMain, Menu, nativeImage, nativeTheme, net, screen, utilityProcess } from 'electron'
import type { UtilityProcess } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { createServer } from 'node:net'

// The built directory structure
//
// ├─┬ dist-electron/
// │ ├── main.js
// │ └── preload.js
// ├─┬ .output/
// │ ├── public/        ← static SPA assets
// │ └── server/        ← Nitro server (production API)
// ├─┬ build/
// │ └── icons/
//
process.env.DIST_ELECTRON = path.join(__dirname)
process.env.DIST = path.join(process.env.DIST_ELECTRON, '../.output/public')
process.env.BUILD = path.join(process.env.DIST_ELECTRON, '../build')

const APP_ICON = path.join(process.env.BUILD, 'icons', 'icon.png')

// Production Nitro server management
let nitroProcess: UtilityProcess | null = null
let nitroUrl: string | null = null

// Base URL for the app (dev server or Nitro server) - used for thumbnail generation
let appBaseUrl: string | null = null

// Set the app name (used for dock hover, window title bar, etc.)
// Without this, Electron defaults to "Electron" in development.
app.name = 'Playshape'

let mainWindow: BrowserWindow | null = null

/**
 * Find an available port by briefly binding to port 0.
 */
function getAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.listen(0, () => {
      const addr = server.address()
      if (addr && typeof addr === 'object') {
        const port = addr.port
        server.close(() => resolve(port))
      }
      else {
        server.close(() => reject(new Error('Could not get port')))
      }
    })
    server.on('error', reject)
  })
}

/**
 * Wait for an HTTP server to respond at the given URL.
 * Retries every 300ms up to ~30 seconds.
 */
function waitForServer(url: string, maxRetries = 100): Promise<void> {
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
          reject(new Error(`Server not ready after ${attempts} attempts`))
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

/**
 * Start the Nitro server in production.
 * Uses Electron's utilityProcess.fork() which correctly handles ESM modules
 * and runs in a separate process with its own Node.js environment.
 */
async function startNitroServer(): Promise<string> {
  const port = await getAvailablePort()
  const serverEntry = path.join(__dirname, '..', '.output', 'server', 'index.mjs')

  // Resolve the migrations folder — bundled as extraResource by electron-builder
  const migrationsPath = app.isPackaged
    ? path.join(process.resourcesPath, 'migrations')
    : path.join(__dirname, '..', 'server', 'database', 'migrations')

  // Resolve the defaults folder — bundled as extraResource by electron-builder
  const defaultsPath = app.isPackaged
    ? path.join(process.resourcesPath, 'defaults')
    : path.join(__dirname, '..', 'server', 'database', 'defaults')

  // User data directory for the SQLite database
  const userDataPath = path.join(app.getPath('userData'), 'data')

  console.log(`[nitro] Starting server on port ${port}`)
  console.log(`[nitro] Server entry: ${serverEntry}`)
  console.log(`[nitro] Migrations: ${migrationsPath}`)
  console.log(`[nitro] Defaults: ${defaultsPath}`)
  console.log(`[nitro] User data: ${userDataPath}`)

  nitroProcess = utilityProcess.fork(serverEntry, [], {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      NITRO_PORT: String(port),
      NITRO_HOST: '127.0.0.1',
      PLAYSHAPE_USER_DATA: userDataPath,
      PLAYSHAPE_MIGRATIONS_PATH: migrationsPath,
      PLAYSHAPE_DEFAULTS_PATH: defaultsPath,
      PLAYSHAPE_RESOURCES_PATH: process.resourcesPath, // For bundled binaries (ffmpeg, etc.)
    },
    stdio: 'pipe',
  })

  // Forward Nitro stdout/stderr to the main process console
  nitroProcess.stdout?.on('data', (data: Buffer) => {
    console.log(`[nitro] ${data.toString().trim()}`)
  })
  nitroProcess.stderr?.on('data', (data: Buffer) => {
    console.error(`[nitro] ${data.toString().trim()}`)
  })

  nitroProcess.on('exit', (code) => {
    console.log(`[nitro] Server exited with code ${code}`)
    nitroProcess = null
  })

  const url = `http://127.0.0.1:${port}`
  await waitForServer(url)
  console.log(`[nitro] Server ready at ${url}`)
  return url
}

// ── Window state persistence ────────────────────────────────────────────────
// Saves window position, size, and maximized state to a JSON file in userData.
// Restored on next launch so the window reappears where the user left it.

interface WindowState {
  x?: number
  y?: number
  width: number
  height: number
  isMaximized?: boolean
}

const WINDOW_STATE_FILE = path.join(app.getPath('userData'), 'window-state.json')

const DEFAULT_STATE: WindowState = { width: 1280, height: 800 }

function loadWindowState(): WindowState {
  try {
    const data = fs.readFileSync(WINDOW_STATE_FILE, 'utf-8')
    const state = JSON.parse(data) as WindowState

    // Validate that the saved position is still on a visible display.
    // If the user disconnected a monitor, the window could be off-screen.
    if (state.x !== undefined && state.y !== undefined) {
      const visible = screen.getAllDisplays().some((display) => {
        const { x, y, width, height } = display.bounds
        return (
          state.x! >= x - 100
          && state.x! < x + width
          && state.y! >= y - 100
          && state.y! < y + height
        )
      })
      if (!visible) {
        // Reset position, keep size
        delete state.x
        delete state.y
      }
    }

    return { ...DEFAULT_STATE, ...state }
  }
  catch {
    return DEFAULT_STATE
  }
}

function saveWindowState(win: BrowserWindow): void {
  const isMaximized = win.isMaximized()
  // Save the normal (non-maximized) bounds so restoring from maximized
  // doesn't persist the full-screen dimensions as the "normal" size.
  const bounds = isMaximized ? win.getNormalBounds() : win.getBounds()
  const state: WindowState = {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    isMaximized,
  }
  try {
    fs.writeFileSync(WINDOW_STATE_FILE, JSON.stringify(state))
  }
  catch {
    // Silently ignore write errors (e.g. read-only filesystem)
  }
}

async function createWindow() {
  const icon = nativeImage.createFromPath(APP_ICON)

  // On macOS the dock icon must be set explicitly during development
  // (in production, electron-builder sets the .icns in the app bundle)
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(icon)
  }

  const isMac = process.platform === 'darwin'
  const windowState = loadWindowState()

  mainWindow = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    x: windowState.x,
    y: windowState.y,
    minWidth: 900,
    minHeight: 600,
    title: 'Playshape',
    icon,
    show: false,
    // Match the app's --ui-bg: white in light mode, playshape-900 in dark mode
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#2e3086' : '#ffffff',

    // Native-feeling title bar:
    // macOS: hidden inset keeps traffic lights but removes the chrome title bar,
    //        letting the web content fill the entire window.
    // Windows: titleBarOverlay renders native window controls on top of web content.
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    ...(process.platform === 'win32' && {
      titleBarOverlay: {
        color: nativeTheme.shouldUseDarkColors ? '#2e3086' : '#ffffff',
        symbolColor: nativeTheme.shouldUseDarkColors ? '#ffffff' : '#0f172a',
        height: 40,
      },
    }),
    trafficLightPosition: isMac ? { x: 16, y: 13 } : undefined,

    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Restore maximized state after window is created
  if (windowState.isMaximized) {
    mainWindow.maximize()
  }

  // Save window state on resize, move, maximize, and unmaximize.
  // Debounce resize/move since they fire rapidly during drag.
  let saveTimeout: ReturnType<typeof setTimeout> | null = null
  const debouncedSave = () => {
    if (saveTimeout) clearTimeout(saveTimeout)
    saveTimeout = setTimeout(() => {
      if (mainWindow) saveWindowState(mainWindow)
    }, 500)
  }

  mainWindow.on('resize', debouncedSave)
  mainWindow.on('move', debouncedSave)
  mainWindow.on('maximize', () => { if (mainWindow) saveWindowState(mainWindow) })
  mainWindow.on('unmaximize', () => { if (mainWindow) saveWindowState(mainWindow) })

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

  // Inspect element at coordinates (dev only)
  ipcMain.on('inspect-element', (_event, x: number, y: number) => {
    mainWindow?.webContents.inspectElement(x, y)
  })

  // ── Thumbnail generation ────────────────────────────────────────────────────
  // Creates a hidden offscreen BrowserWindow, loads the preview URL, sends
  // init and update payloads via postMessage (same protocol as the actual
  // preview iframe), waits for the component to mount, then captures a
  // screenshot using webContents.capturePage().
  // Returns a base64-encoded JPEG data URL (small file size for card thumbnails).
  ipcMain.handle('generate-thumbnail', async (_event, args: {
    url: string
    initPayload: {
      dependencies: Array<{ name: string, url: string, global: string }>
      tools: Array<{ id: string, headHtml: string, setupJs: string }>
      dark: boolean
    }
    updatePayload: {
      type: 'update'
      sfc: string
      data: Record<string, unknown>
      depMappings: Record<string, string>
      nuxtUI?: {
        components: string[]
        icons: Array<{ id: string, collection: string, name: string }>
        optionalChunks?: string[]
      } | null
      slotContent?: unknown
    }
    brandPayload?: {
      css: string
      fontLink?: string
    }
  }) => {
    const THUMBNAIL_WIDTH = 800
    const THUMBNAIL_HEIGHT = 600
    const CAPTURE_TIMEOUT = 30000 // 30s max wait for render

    // Resolve relative URL against app base URL
    let fullUrl = args.url
    if (args.url.startsWith('/') && appBaseUrl) {
      fullUrl = new URL(args.url, appBaseUrl).toString()
    }
    console.log(`[thumbnail] Loading URL: ${fullUrl}`)

    const offscreen = new BrowserWindow({
      width: THUMBNAIL_WIDTH,
      height: THUMBNAIL_HEIGHT,
      show: false,
      webPreferences: {
        offscreen: true,
        contextIsolation: false, // Needed so executeJavaScript runs in the page context
        nodeIntegration: false,
      },
    })

    try {
      const result = await new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Thumbnail capture timed out'))
        }, CAPTURE_TIMEOUT)

        offscreen.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
          clearTimeout(timeout)
          reject(new Error(`Failed to load preview: ${errorDescription} (${errorCode})`))
        })

        offscreen.webContents.on('did-finish-load', async () => {
          try {
            console.log('[thumbnail] Page loaded, waiting for Vue...')
            // Poll until Vue and vue3-sfc-loader are available (CDN scripts loaded)
            const maxWait = 15000
            const start = Date.now()
            let vueReady = false
            while (Date.now() - start < maxWait) {
              const ready = await offscreen.webContents.executeJavaScript(
                `!!(window.Vue && window['vue3-sfc-loader'])`,
              )
              if (ready) {
                vueReady = true
                break
              }
              await new Promise(r => setTimeout(r, 200))
            }

            if (!vueReady) {
              throw new Error('Vue/vue3-sfc-loader did not load within timeout')
            }
            console.log('[thumbnail] Vue ready, sending init...')

            // Send init message (dependencies, tools, dark mode)
            await offscreen.webContents.executeJavaScript(`
              window.postMessage({
                type: 'init',
                dependencies: ${JSON.stringify(args.initPayload.dependencies)},
                tools: ${JSON.stringify(args.initPayload.tools)},
                dark: ${JSON.stringify(args.initPayload.dark)}
              }, '*');
            `)

            // Wait for dependencies and tools to load
            await new Promise(r => setTimeout(r, 1000))
            console.log('[thumbnail] Sending update...')

            // Send brand payload if provided
            if (args.brandPayload) {
              await offscreen.webContents.executeJavaScript(`
                window.postMessage({
                  type: 'brand',
                  css: ${JSON.stringify(args.brandPayload.css)},
                  fontLink: ${JSON.stringify(args.brandPayload.fontLink || null)}
                }, '*');
              `)
              await new Promise(r => setTimeout(r, 500))
            }

            // Send update message - pass the entire payload as-is (same structure as buildUpdatePayload)
            await offscreen.webContents.executeJavaScript(`
              window.postMessage(${JSON.stringify(args.updatePayload)}, '*');
            `)

            // Wait for the component to mount and render
            // Poll for the app element to have content (indicates Vue mounted)
            console.log('[thumbnail] Waiting for component to mount...')
            const mountMaxWait = 10000
            const mountStart = Date.now()
            while (Date.now() - mountStart < mountMaxWait) {
              const hasContent = await offscreen.webContents.executeJavaScript(`
                (() => {
                  const app = document.getElementById('app');
                  // Check if app has meaningful content (not empty or just error/loading state)
                  return app && app.children.length > 0 && !app.querySelector('.preview-empty') && !app.querySelector('.preview-error');
                })()
              `)
              if (hasContent) {
                console.log('[thumbnail] Component mounted')
                break
              }
              await new Promise(r => setTimeout(r, 200))
            }

            // Extra wait for Tailwind JIT and any animations to settle
            await new Promise(r => setTimeout(r, 1500))
            console.log('[thumbnail] Capturing...')

            // Capture the page
            const image = await offscreen.webContents.capturePage()
            const jpeg = image.toJPEG(80) // 80% quality
            const dataUrl = `data:image/jpeg;base64,${jpeg.toString('base64')}`

            clearTimeout(timeout)
            resolve(dataUrl)
          }
          catch (err) {
            clearTimeout(timeout)
            reject(err)
          }
        })

        // Load the preview URL
        offscreen.loadURL(fullUrl)
      })

      return result
    }
    finally {
      offscreen.destroy()
    }
  })

  // Show/hide macOS traffic light buttons (close/minimize/fullscreen)
  // Used to sync traffic lights with sidebar visibility
  if (isMac) {
    ipcMain.on('set-traffic-lights-visible', (_event, visible: boolean) => {
      mainWindow?.setWindowButtonVisibility(visible)
    })
  }

  // In development, load the Vite dev server URL.
  // In production, start the Nitro server and load from it.
  if (process.env.VITE_DEV_SERVER_URL) {
    await waitForServer(process.env.VITE_DEV_SERVER_URL)

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

    appBaseUrl = process.env.VITE_DEV_SERVER_URL
    mainWindow.loadURL(appBaseUrl)
  }
  else if (nitroUrl) {
    appBaseUrl = nitroUrl
    mainWindow.loadURL(nitroUrl)
  }
  else {
    // Fallback: load static files directly (no API routes available)
    mainWindow.loadFile(path.join(process.env.DIST!, 'index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(async () => {
  // Set up custom application menu (removes Cmd+R reload to prevent accidental refresh)
  setupApplicationMenu()

  // In production, start the embedded Nitro server before showing any UI.
  // In dev, the Vite dev server (which includes Nitro) is already running.
  if (!process.env.VITE_DEV_SERVER_URL) {
    try {
      nitroUrl = await startNitroServer()
    }
    catch (err) {
      console.error('[electron] Failed to start Nitro server:', err)
      // Continue anyway — the window will show but API routes won't work
    }
  }

  createWindow()
})

/**
 * Set up a custom application menu that removes reload shortcuts.
 * This prevents accidental page refreshes (Cmd+R / F5) which would
 * interrupt background tasks like image generation or video processing.
 */
function setupApplicationMenu(): void {
  const isMac = process.platform === 'darwin'

  const template: Electron.MenuItemConstructorOptions[] = [
    // App menu (macOS only)
    ...(isMac
      ? [{
          label: app.name,
          submenu: [
            { role: 'about' as const },
            { type: 'separator' as const },
            { role: 'services' as const },
            { type: 'separator' as const },
            { role: 'hide' as const },
            { role: 'hideOthers' as const },
            { role: 'unhide' as const },
            { type: 'separator' as const },
            { role: 'quit' as const },
          ],
        }]
      : []),
    // Edit menu
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        ...(isMac
          ? [
              { role: 'pasteAndMatchStyle' as const },
              { role: 'delete' as const },
              { role: 'selectAll' as const },
            ]
          : [
              { role: 'delete' as const },
              { type: 'separator' as const },
              { role: 'selectAll' as const },
            ]),
      ],
    },
    // View menu (WITHOUT reload options)
    {
      label: 'View',
      submenu: [
        // Intentionally omit 'reload' and 'forceReload' roles
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    // Window menu
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? [
              { type: 'separator' as const },
              { role: 'front' as const },
              { type: 'separator' as const },
              { role: 'window' as const },
            ]
          : [{ role: 'close' as const }]),
      ],
    },
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

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

// Clean up the Nitro server process on app quit
app.on('before-quit', () => {
  if (nitroProcess) {
    console.log('[nitro] Shutting down server')
    nitroProcess.kill()
    nitroProcess = null
  }
})
