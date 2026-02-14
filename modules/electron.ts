import { defineNuxtModule } from '@nuxt/kit'
import { build, startup } from 'vite-plugin-electron'
import type { ElectronOptions } from 'vite-plugin-electron'

// Use inline types to avoid requiring `vite` as a direct dependency
type ViteResolvedConfig = { mode: string }
type ViteDevServer = { ws: { send: (payload: { type: string }) => void } }

export interface ModuleOptions {
  /**
   * Electron entry builds — main process, preload scripts, etc.
   */
  build: ElectronOptions[]
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'electron',
    configKey: 'electron',
  },

  setup(options, nuxt) {
    // Always disable SSR for Electron
    nuxt.options.ssr = false

    // Production-only: configure for file:// protocol loading
    // In dev, Electron loads from http://localhost so standard base URLs work fine
    if (!nuxt.options.dev) {
      nuxt.options.app.baseURL = './'
      nuxt.options.app.buildAssetsDir = '/'
      nuxt.options.runtimeConfig.app.baseURL = './'
      nuxt.options.runtimeConfig.app.buildAssetsDir = '/'
      nuxt.options.router.options.hashMode = true

      nuxt.options.nitro.runtimeConfig ??= {}
      nuxt.options.nitro.runtimeConfig.app ??= {} as Record<string, string>
      ;(nuxt.options.nitro.runtimeConfig.app as Record<string, string>).baseURL = './'
    }

    // Resolve the Vite config so we can pass mode to electron builds
    let viteConfigResolve: (config: ViteResolvedConfig) => void
    const viteConfigPromise = new Promise<ViteResolvedConfig>(resolve => viteConfigResolve = resolve)

    // Capture the Vite dev server instance for HMR reload
    let viteServerResolve: (server: ViteDevServer) => void
    const viteServerPromise = new Promise<ViteDevServer>(resolve => viteServerResolve = resolve)

    nuxt.hook('vite:extendConfig', (viteInlineConfig) => {
      ;(viteInlineConfig.plugins as unknown[]) ??= []
      ;(viteInlineConfig.plugins as unknown[]).push({
        name: 'electron:capture-config',
        configResolved(config: ViteResolvedConfig) {
          viteConfigResolve(config)
        },
      })
    })

    nuxt.hook('vite:serverCreated', (server) => {
      viteServerResolve(server)
    })

    // Prevent Electron from trying to lazy-load chunks via HTTP in production
    nuxt.hook('build:manifest', (manifest) => {
      for (const key in manifest) {
        const entry = manifest[key]
        if (entry) {
          entry.dynamicImports = []
        }
      }
    })

    // Development: build electron entries with watch mode and auto-start
    nuxt.hook('listen', (_server, listener) => {
      (async () => {
        const address = listener.address as { port: number }
        process.env.VITE_DEV_SERVER_URL = `http://localhost:${address.port}`

        const viteConfig = await viteConfigPromise
        const entryCount = options.build.length
        let initialBuildCount = 0
        let electronStarted = false

        for (const config of options.build) {
          const isMainProcess = !config.onstart

          config.vite ??= {}
          config.vite.mode ??= viteConfig.mode
          config.vite.logLevel ??= 'warn'
          config.vite.build ??= {}
          config.vite.build.watch ??= {}
          config.vite.plugins ??= []

          config.vite.plugins.push({
            name: 'electron:startup',
            closeBundle() {
              // Initial build: wait for all entries to finish before starting Electron
              if (!electronStarted) {
                initialBuildCount++
                if (initialBuildCount >= entryCount) {
                  electronStarted = true
                  startup()
                }
                return
              }

              // Subsequent rebuilds (file watching):
              // - Main process change: restart Electron entirely
              // - Preload/other change: just reload the renderer via HMR
              if (isMainProcess) {
                startup()
              }
              else {
                viteServerPromise.then(server => server.ws.send({ type: 'full-reload' }))
              }
            },
          })

          build(config)
        }
      })()
    })

    // Production: build electron entries after Nuxt build completes
    nuxt.hook('build:done', async () => {
      if (!nuxt.options.dev) {
        const viteConfig = await viteConfigPromise

        for (const config of options.build) {
          config.vite ??= {}
          config.vite.mode ??= viteConfig.mode
          await build(config)
        }
      }
    })
  },
})
