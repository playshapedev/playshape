// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  ssr: false,

  modules: [
    '@nuxt/ui',
    '@nuxt/eslint',
    '@nuxt/fonts',
  ],

  css: ['~/assets/css/main.css'],

  app: {
    head: {
      title: 'Playshape',
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico', sizes: '32x32' },
        { rel: 'icon', type: 'image/png', href: '/favicon-16x16.png', sizes: '16x16' },
        { rel: 'icon', type: 'image/png', href: '/favicon-32x32.png', sizes: '32x32' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png', sizes: '180x180' },
      ],
    },
  },

  electron: {
    build: [
      {
        entry: 'electron/main.ts',
      },
      {
        entry: 'electron/preload.ts',
      },
    ],
  },

  nitro: {
    // Native addons can't be bundled by Nitro
    rollupConfig: {
      external: ['better-sqlite3'],
    },
  },

  devServer: {
    port: 3200,
  },

  devtools: { enabled: true },

  compatibilityDate: '2026-02-14',
})
