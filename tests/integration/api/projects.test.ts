import { describe, it, expect } from 'vitest'
import type { projects } from '~~/server/database/schema'
import { api } from '../utils/api'

type Project = typeof projects.$inferSelect

async function createProject(name = 'Test project', description?: string) {
  const res = await api<Project>('/api/projects', { method: 'POST', body: { name, description } })
  expect(res.status).toBe(200)
  return res.data
}

describe('Projects API', () => {
  describe('POST /api/projects', () => {
    it('creates a project and returns it', async () => {
      const project = await createProject('Onboarding', 'New hire practice')

      expect(project).toMatchObject({
        id: expect.any(String),
        name: 'Onboarding',
        description: 'New hire practice',
      })
    })

    it('defaults the description to an empty string', async () => {
      const project = await createProject('No description')
      expect(project.description).toBe('')
    })

    it('rejects a missing or empty name with 400', async () => {
      expect((await api('/api/projects', { method: 'POST', body: { name: '' } })).status).toBe(400)
      expect((await api('/api/projects', { method: 'POST', body: {} })).status).toBe(400)
    })
  })

  describe('GET /api/projects', () => {
    it('lists created projects', async () => {
      const project = await createProject('Listed project')

      const res = await api<Project[]>('/api/projects')

      expect(res.status).toBe(200)
      expect(res.data.map(p => p.id)).toContain(project.id)
    })
  })

  describe('GET /api/projects/:id', () => {
    it('returns the project', async () => {
      const project = await createProject('Fetch me')

      const res = await api<Project>(`/api/projects/${project.id}`)

      expect(res.status).toBe(200)
      expect(res.data.name).toBe('Fetch me')
    })

    it('returns 404 for an unknown id', async () => {
      expect((await api('/api/projects/does-not-exist')).status).toBe(404)
    })
  })

  describe('PATCH /api/projects/:id', () => {
    it('updates only the provided fields', async () => {
      const project = await createProject('Before', 'Keep me')

      const res = await api<Project>(`/api/projects/${project.id}`, { method: 'PATCH', body: { name: 'After' } })

      expect(res.status).toBe(200)
      expect(res.data).toMatchObject({ name: 'After', description: 'Keep me' })
    })

    it('rejects an empty name with 400', async () => {
      const project = await createProject()
      const res = await api(`/api/projects/${project.id}`, { method: 'PATCH', body: { name: '' } })
      expect(res.status).toBe(400)
    })

    it('returns 404 for an unknown id', async () => {
      const res = await api('/api/projects/does-not-exist', { method: 'PATCH', body: { name: 'x' } })
      expect(res.status).toBe(404)
    })
  })

  describe('DELETE /api/projects/:id', () => {
    it('deletes the project', async () => {
      const project = await createProject('Delete me')

      const res = await api(`/api/projects/${project.id}`, { method: 'DELETE' })

      expect(res.status).toBe(204)
      expect((await api(`/api/projects/${project.id}`)).status).toBe(404)
    })

    it('returns 404 for an unknown id', async () => {
      expect((await api('/api/projects/does-not-exist', { method: 'DELETE' })).status).toBe(404)
    })
  })
})
