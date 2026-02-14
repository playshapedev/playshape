import type { projects } from '~~/server/database/schema'

type Project = typeof projects.$inferSelect

export function useProjects() {
  const { data, pending, error, refresh } = useFetch<Project[]>('/api/projects')

  return { projects: data, pending, error, refresh }
}

export function useProject(id: MaybeRef<string>) {
  const resolvedId = toRef(id)
  const { data, pending, error, refresh } = useFetch<Project>(() => `/api/projects/${resolvedId.value}`)

  return { project: data, pending, error, refresh }
}

export async function createProject(data: { name: string; description?: string }) {
  return $fetch<Project>('/api/projects', {
    method: 'POST',
    body: data,
  })
}

export async function updateProject(id: string, data: { name?: string; description?: string }) {
  return $fetch<Project>(`/api/projects/${id}`, {
    method: 'PATCH',
    body: data,
  })
}

export async function deleteProject(id: string) {
  return $fetch(`/api/projects/${id}`, {
    method: 'DELETE',
  })
}
