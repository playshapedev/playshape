import type { libraries, documents } from '~~/server/database/schema'

type Library = typeof libraries.$inferSelect & { documentCount?: number }
type Document = typeof documents.$inferSelect

// ─── Library CRUD ────────────────────────────────────────────────────────────

export function useLibraries() {
  const { data, pending, error, refresh } = useFetch<Library[]>('/api/libraries')
  return { libraries: data, pending, error, refresh }
}

export function useLibrary(id: MaybeRef<string>) {
  const resolvedId = toRef(id)
  const { data, pending, error, refresh } = useFetch<Library>(() => `/api/libraries/${resolvedId.value}`)
  return { library: data, pending, error, refresh }
}

export async function createLibrary(data: { name: string; description?: string }) {
  return $fetch<Library>('/api/libraries', {
    method: 'POST',
    body: data,
  })
}

export async function updateLibrary(id: string, data: { name?: string; description?: string }) {
  return $fetch<Library>(`/api/libraries/${id}`, {
    method: 'PATCH',
    body: data,
  })
}

export async function deleteLibrary(id: string) {
  return $fetch(`/api/libraries/${id}`, {
    method: 'DELETE',
  })
}

// ─── Documents within a Library ──────────────────────────────────────────────

export function useLibraryDocuments(libraryId: MaybeRef<string>) {
  const resolvedId = toRef(libraryId)
  const { data, pending, error, refresh } = useFetch<Document[]>(
    () => `/api/libraries/${resolvedId.value}/documents`,
  )
  return { documents: data, pending, error, refresh }
}

export async function uploadDocument(libraryId: string, file: File) {
  const formData = new FormData()
  formData.append('file', file)

  return $fetch<Document>(`/api/libraries/${libraryId}/documents`, {
    method: 'POST',
    body: formData,
  })
}

export async function createTextDocument(libraryId: string, data: { title: string; content: string }) {
  return $fetch<Document>(`/api/libraries/${libraryId}/documents`, {
    method: 'POST',
    body: data,
  })
}

export async function deleteDocument(libraryId: string, documentId: string) {
  return $fetch(`/api/libraries/${libraryId}/documents/${documentId}`, {
    method: 'DELETE',
  })
}

// ─── Semantic Search ─────────────────────────────────────────────────────────

export interface SearchResult {
  id: string
  documentId: string
  text: string
  chunkIndex: number
  score: number
  document: {
    id: string
    title: string
    sourceType: string
  } | null
}

export async function searchLibrary(libraryId: string, query: string, limit = 10) {
  return $fetch<SearchResult[]>(`/api/libraries/${libraryId}/search`, {
    params: { q: query, limit },
  })
}

// ─── Project-Library Linking ─────────────────────────────────────────────────

type LinkedLibrary = Library & { linkedAt?: string | number | Date }

export function useProjectLibraries(projectId: MaybeRef<string>) {
  const resolvedId = toRef(projectId)
  const { data, pending, error, refresh } = useFetch<LinkedLibrary[]>(
    () => `/api/projects/${resolvedId.value}/libraries`,
  )
  return { libraries: data, pending, error, refresh }
}

export async function linkLibrary(projectId: string, libraryId: string) {
  return $fetch(`/api/projects/${projectId}/libraries`, {
    method: 'POST',
    body: { libraryId },
  })
}

export async function unlinkLibrary(projectId: string, libraryId: string) {
  return $fetch(`/api/projects/${projectId}/libraries/${libraryId}`, {
    method: 'DELETE',
  })
}
