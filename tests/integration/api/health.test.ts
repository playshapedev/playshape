import { describe, it, expect } from 'vitest'
import { api } from '../utils/api'

describe('GET /api/health', () => {
  it('reports ok with a connected database', async () => {
    const res = await api<{ status: string, platform: string, database: string, timestamp: number }>('/api/health')

    expect(res.status).toBe(200)
    expect(res.data).toMatchObject({ status: 'ok', platform: 'web', database: 'ok' })
    expect(res.data.timestamp).toBeGreaterThan(0)
  })
})
