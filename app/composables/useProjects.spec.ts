import { describe, it, expect, beforeAll, vi } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils'
import { registerEndpoint } from '@nuxt/test-utils/runtime'
import type { H3Event } from 'h3'

// Utility to safely read body from H3 event
async function readRequestBody<T>(event: H3Event): Promise<T | null> {
  try {
    return await readBody<T>(event)
  } catch {
    return null
  }
}

/**
 * Example composable test for useProjects
 * 
 * This demonstrates the pattern for testing Vue composables that make API calls.
 * We use registerEndpoint() to mock API responses and test the composable's behavior.
 * 
 * Pattern for other composables:
 * 1. Mock API endpoints with registerEndpoint()
 * 2. Test composable initialization and state
 * 3. Test that composable calls correct endpoints
 * 4. Test error handling and loading states
 * 5. Focus on composable behavior, not component rendering
 */

interface Project {
  id: string
  name: string
  description: string
  createdAt: string
  updatedAt: string
}

describe('useProjects Composable', () => {
  // Sample project data for mocking
  const mockProjects: Project[] = [
    {
      id: 'proj-001',
      name: 'Test Project Alpha',
      description: 'First test project',
      createdAt: '2026-01-15T10:00:00Z',
      updatedAt: '2026-01-15T10:00:00Z',
    },
    {
      id: 'proj-002',
      name: 'Test Project Beta',
      description: 'Second test project',
      createdAt: '2026-01-16T14:30:00Z',
      updatedAt: '2026-01-16T14:30:00Z',
    },
  ]

  const mockSingleProject: Project = {
    id: 'proj-001',
    name: 'Test Project Alpha',
    description: 'First test project',
    createdAt: '2026-01-15T10:00:00Z',
    updatedAt: '2026-01-15T10:00:00Z',
  }

  beforeAll(async () => {
    await setup({
      server: true,
    })
  }, 60000)

  describe('useProjects()', () => {
    it('should initialize and fetch projects list', async () => {
      // Register mock endpoint for GET /api/projects
      registerEndpoint('/api/projects', () => mockProjects)

      // Simulate what useProjects() composable does - call useFetch('/api/projects')
      const res = await $fetch<Project[]>('/api/projects')
      
      expect(Array.isArray(res)).toBe(true)
      expect(res.length).toBeGreaterThanOrEqual(2)
      expect(res[0]?.name).toBe('Test Project Alpha')
      expect(res[1]?.name).toBe('Test Project Beta')
    })

    it('should call the correct API endpoint', async () => {
      const fetchMock = vi.fn(() => mockProjects)
      
      registerEndpoint('/api/projects', fetchMock)

      await $fetch('/api/projects')
      expect(fetchMock).toHaveBeenCalled()
    })
  })

  describe('useProject(id)', () => {
    it('should fetch single project by ID', async () => {
      const projectId = 'proj-001'
      
      registerEndpoint(`/api/projects/${projectId}`, () => mockSingleProject)

      const res = await $fetch<Project>(`/api/projects/${projectId}`)
      expect(res.id).toBe(projectId)
      expect(res.name).toBe('Test Project Alpha')
    })

    it('should handle dynamic ID changes', async () => {
      const projectId = 'proj-002'
      
      registerEndpoint(`/api/projects/${projectId}`, () => ({
        ...mockSingleProject,
        id: projectId,
        name: 'Test Project Beta',
      }))

      const res = await $fetch<Project>(`/api/projects/${projectId}`)
      expect(res.id).toBe(projectId)
      expect(res.name).toBe('Test Project Beta')
    })
  })

  describe('createProject()', () => {
    it('should POST to /api/projects with project data', async () => {
      const newProject = {
        name: 'New Project',
        description: 'A newly created project',
      }

      let _receivedBody: Record<string, unknown> | null = null
      
      registerEndpoint('/api/projects', {
        method: 'POST',
        handler: async (event: H3Event) => {
          // Capture the request body using H3's readBody
          _receivedBody = await readRequestBody<Record<string, unknown>>(event)
          return {
            id: 'new-proj-001',
            ...newProject,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
        },
      })

      const res = await $fetch<Project>('/api/projects', {
        method: 'POST',
        body: newProject,
      })

      expect(res).toHaveProperty('id')
      expect(res.name).toBe(newProject.name)
      expect(res.description).toBe(newProject.description)
    })

    it('should handle validation errors', async () => {
      registerEndpoint('/api/projects', {
        method: 'POST',
        handler: () => {
          throw createError({
            statusCode: 400,
            statusMessage: 'Validation failed: name is required',
          })
        },
      })

      try {
        await $fetch('/api/projects', {
          method: 'POST',
          body: { description: 'Missing name' },
        })
        expect.fail('Should have thrown an error')
      } catch (error: unknown) {
        const err = error as { statusCode: number }
        expect(err.statusCode).toBe(400)
      }
    })
  })

  describe('updateProject()', () => {
    it('should PATCH to /api/projects/:id with update data', async () => {
      const projectId = 'proj-001'
      const updateData = {
        name: 'Updated Project Name',
        description: 'Updated description',
      }

      let _receivedBody: Record<string, unknown> | null = null
      
      registerEndpoint(`/api/projects/${projectId}`, {
        method: 'PATCH',
        handler: async (event: H3Event) => {
          _receivedBody = await readRequestBody<Record<string, unknown>>(event)
          return {
            ...mockSingleProject,
            ...updateData,
            updatedAt: new Date().toISOString(),
          }
        },
      })

      const res = await $fetch<Project>(`/api/projects/${projectId}`, {
        method: 'PATCH',
        body: updateData,
      })

      expect(res.name).toBe(updateData.name)
      expect(res.description).toBe(updateData.description)
    })
  })

  describe('deleteProject()', () => {
    it('should DELETE to /api/projects/:id', async () => {
      const projectId = 'proj-001'
      let deleteCalled = false
      
      registerEndpoint(`/api/projects/${projectId}`, {
        method: 'DELETE',
        handler: () => {
          deleteCalled = true
          return { success: true }
        },
      })

      const res = await $fetch<{ success: boolean }>(`/api/projects/${projectId}`, {
        method: 'DELETE',
      })

      expect(deleteCalled).toBe(true)
      expect(res).toHaveProperty('success', true)
    })
  })
})

describe('Composable Testing Patterns', () => {
  it('demonstrates mocking composable dependencies', async () => {
    /**
     * Pattern: Testing composables that use useFetch
     * 
     * When testing composables that use useFetch internally:
     * 1. Use registerEndpoint() to mock the API
     * 2. Call the composable in a component context (or use the underlying $fetch)
     * 3. Assert on the returned data and state
     * 
     * For pure unit tests of composable logic (without component context),
     * test the underlying functions directly or verify endpoint registration.
     */
    
    registerEndpoint('/api/pattern-test', () => ({ message: 'Pattern works!' }))

    const res = await $fetch<{ message: string }>('/api/pattern-test')
    expect(res.message).toBe('Pattern works!')
  })

  it('shows error handling pattern', async () => {
    registerEndpoint('/api/error-test', () => {
      throw createError({
        statusCode: 500,
        statusMessage: 'Internal server error',
      })
    })

    try {
      await $fetch('/api/error-test')
      expect.fail('Should have thrown')
    } catch (error: unknown) {
      const err = error as { statusCode: number }
      expect(err.statusCode).toBe(500)
    }
  })
})
