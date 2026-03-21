import { setup } from '@nuxt/test-utils'
import { beforeAll } from 'vitest'

// Setup Nuxt test environment
beforeAll(async () => {
  await setup({
    server: false,
  })
})
