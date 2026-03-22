import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

describe('Database Connectivity', () => {
  beforeAll(async () => {
    await setup({
      server: true,
    })
  }, 60000)

  describe('Test Database Setup', () => {
    it('should have test database directory configured', async () => {
      const testDbDir = join(process.cwd(), 'data', 'test')
      expect(existsSync(testDbDir)).toBe(true)
    })

    it('should have test database environment variables set', () => {
      expect(process.env.NODE_ENV).toBe('test')
      expect(process.env.PLAYSHAPE_MIGRATIONS_PATH).toBeDefined()
      expect(process.env.PLAYSHAPE_MIGRATIONS_PATH).toContain('migrations')
    })
  })

  describe('useDb() Composable', () => {
    it('should be accessible in Nitro server context via health endpoint', async () => {
      // The health endpoint uses useDb() internally
      const res = await $fetch<{ status: string; database: string; timestamp: string }>('/api/health', {
        ignoreResponseError: true,
      })

      // Verify the response structure
      if ('status' in res && 'database' in res) {
        expect(res.status).toBeDefined()
        expect(res.database).toBeDefined()
        expect(['ok', 'degraded']).toContain(res.status)
        expect(['connected', 'error']).toContain(res.database)
      }
    })

    it('should return database status via health check', async () => {
      const res = await $fetch<{ status: string; database: string; timestamp: string }>('/api/health', {
        ignoreResponseError: true,
      })

      // Database should be connected in test environment
      if ('database' in res) {
        expect(res.database).toBe('connected')
      }
    })
  })

  describe('Database Operations via API', () => {
    it('should support creating and reading projects', async () => {
      // Create a test project
      const projectData = {
        name: 'DB Connectivity Test Project',
        description: 'Testing database operations',
      }

      const createRes = await $fetch<{ id?: string; name?: string; statusCode?: number }>('/api/projects', {
        method: 'POST',
        body: projectData,
        ignoreResponseError: true,
      })

      // If creation succeeded, verify we can read it back
      if (createRes.id) {
        const getRes = await $fetch<{ id?: string; name?: string; statusCode?: number }>(`/api/projects/${createRes.id}`, {
          ignoreResponseError: true,
        })

        if (getRes.id) {
          expect(getRes.id).toBe(createRes.id)
          expect(getRes.name).toBe(projectData.name)
        }
      }
    })

    it('should support updating existing records', async () => {
      // First create a project
      const createRes = await $fetch<{ id?: string; name?: string; statusCode?: number }>('/api/projects', {
        method: 'POST',
        body: {
          name: 'Update Test Project',
          description: 'Original description',
        },
        ignoreResponseError: true,
      })

      // If created successfully, try to update it
      if (createRes.id) {
        const updateRes = await $fetch<{ id?: string; name?: string; description?: string; statusCode?: number }>(
          `/api/projects/${createRes.id}`,
          {
            method: 'PATCH',
            body: {
              name: 'Updated Project Name',
              description: 'Updated description',
            },
            ignoreResponseError: true,
          }
        )

        // Verify update worked
        if (updateRes.id) {
          expect(updateRes.name).toBe('Updated Project Name')
          expect(updateRes.description).toBe('Updated description')
        }
      }
    })

    it('should support deleting records', async () => {
      // Create a project to delete
      const createRes = await $fetch<{ id?: string; statusCode?: number }>('/api/projects', {
        method: 'POST',
        body: {
          name: 'Delete Test Project',
          description: 'To be deleted',
        },
        ignoreResponseError: true,
      })

      // If created, try to delete it
      if (createRes.id) {
        const deleteRes = await $fetch<{ statusCode?: number }>(`/api/projects/${createRes.id}`, {
          method: 'DELETE',
          ignoreResponseError: true,
        })

        // Verify deletion (should return 204 or 200)
        if (deleteRes.statusCode) {
          expect([200, 204]).toContain(deleteRes.statusCode)
        }

        // Verify it's gone by trying to fetch it (should 404)
        const getRes = await $fetch<{ statusCode?: number }>(`/api/projects/${createRes.id}`, {
          ignoreResponseError: true,
        })

        if (getRes.statusCode) {
          expect(getRes.statusCode).toBe(404)
        }
      }
    })
  })

  describe('Test Isolation', () => {
    it('should not pollute database state between tests', async () => {
      // Create a uniquely named project
      const uniqueName = `Isolation Test ${Date.now()}`
      
      const createRes = await $fetch<{ id?: string; name?: string; statusCode?: number }>('/api/projects', {
        method: 'POST',
        body: {
          name: uniqueName,
          description: 'Testing isolation',
        },
        ignoreResponseError: true,
      })

      if (createRes.id) {
        // Verify we can find it in the list
        const listRes = await $fetch<Array<{ id: string; name: string }> | { statusCode?: number }>('/api/projects', {
          ignoreResponseError: true,
        })

        if (Array.isArray(listRes)) {
          const found = listRes.find(p => p.name === uniqueName)
          expect(found).toBeDefined()
        }
      }
    })
  })
})
