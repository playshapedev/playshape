import type { templates } from '~~/server/database/schema'

export type Template = typeof templates.$inferSelect

export function useTemplates() {
  const { data, pending, error, refresh } = useFetch<Template[]>('/api/templates')
  return { templates: data, pending, error, refresh }
}

export function useTemplate(id: MaybeRef<string>) {
  const resolvedId = toRef(id)
  const { data, pending, error, refresh } = useFetch<Template>(() => `/api/templates/${resolvedId.value}`)
  return { template: data, pending, error, refresh }
}

export async function createTemplate(data: { name: string; description?: string }) {
  return $fetch<Template>('/api/templates', {
    method: 'POST',
    body: data,
  })
}

export async function updateTemplate(id: string, data: {
  name?: string
  description?: string
  inputSchema?: unknown
  component?: string | null
  sampleData?: Record<string, unknown>
  dependencies?: Array<{ name: string; url: string; global: string }>
  messages?: unknown
  thumbnail?: string | null
  status?: 'draft' | 'published'
}) {
  return $fetch<Template>(`/api/templates/${id}`, {
    method: 'PATCH',
    body: data,
  })
}

export async function deleteTemplate(id: string) {
  return $fetch(`/api/templates/${id}`, {
    method: 'DELETE',
  })
}
