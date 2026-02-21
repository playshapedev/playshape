import type { templates, TemplateKind } from '~~/server/database/schema'

export type Template = typeof templates.$inferSelect

/** Generate the cache key for a templates list */
export function getTemplatesKey(kind?: TemplateKind) {
  return kind ? `templates:${kind}` : 'templates:all'
}

export function useTemplates(kind?: MaybeRef<TemplateKind>) {
  const resolvedKind = kind ? toRef(kind) : undefined
  const key = getTemplatesKey(toValue(kind))
  const { data, pending, error, refresh } = useFetch<Template[]>(
    () => resolvedKind?.value ? `/api/templates?kind=${resolvedKind.value}` : '/api/templates',
    { key },
  )
  return { templates: data, pending, error, refresh }
}

export function useTemplate(id: MaybeRef<string>) {
  const resolvedId = toRef(id)
  const { data, pending, error, refresh } = useFetch<Template>(() => `/api/templates/${resolvedId.value}`)
  return { template: data, pending, error, refresh }
}

export async function createTemplate(data: { name: string; description?: string; kind?: TemplateKind }) {
  return $fetch<Template>('/api/templates', {
    method: 'POST',
    body: data,
  })
}

export async function updateTemplate(id: string, data: {
  kind?: TemplateKind
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
