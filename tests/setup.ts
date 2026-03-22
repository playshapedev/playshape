import { setup } from '@nuxt/test-utils'
import { beforeAll } from 'vitest'

// Setup Nuxt test environment with Nitro server
beforeAll(async () => {
  await setup({
    server: true,
  })
})
