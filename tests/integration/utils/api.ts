/**
 * In-process API client for integration tests.
 *
 * Mounts every handler in server/api on an h3 app using Nitro's file-based
 * routing conventions, then dispatches Web `Request`s to it directly. Handlers
 * are imported lazily, so a test only loads the routes it actually calls.
 */
import { createApp, createRouter, lazyEventHandler, toWebHandler } from 'h3'
import type { EventHandler, RouterMethod } from 'h3'

const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const

/**
 * Converts a server/api file path to an h3 route.
 * e.g. `projects/[id]/courses/[courseId].patch.ts` → `PATCH /api/projects/:id/courses/:courseId`
 */
export function routeFromFile(file: string): { path: string, method?: RouterMethod } {
  let name = file.replace(/^.*\/server\/api\//, '').replace(/\.ts$/, '')

  let method: RouterMethod | undefined
  const methodMatch = name.match(/\.(\w+)$/)
  if (methodMatch && (METHODS as readonly string[]).includes(methodMatch[1]!)) {
    method = methodMatch[1] as RouterMethod
    name = name.slice(0, -methodMatch[0].length)
  }

  const segments = name
    .split('/')
    .filter((segment, i, all) => !(segment === 'index' && i === all.length - 1))
    .map(segment => segment
      .replace(/^\[\.\.\.(\w+)\]$/, '**:$1')
      .replace(/\[(\w+)\]/g, ':$1'))

  return { path: ['/api', ...segments].join('/'), method }
}

const modules = import.meta.glob<{ default: EventHandler }>('../../../server/api/**/*.ts')

const app = createApp()
const router = createRouter()
for (const [file, load] of Object.entries(modules)) {
  const { path, method } = routeFromFile(file)
  router.add(path, lazyEventHandler(async () => (await load()).default), method)
}
app.use(router)

const handle = toWebHandler(app)

export interface ApiResponse<T> {
  status: number
  headers: Headers
  data: T
}

/**
 * Calls an API route. Never throws on HTTP errors: assert on `status` instead.
 * JSON responses are parsed, binary ones (e.g. ZIP exports) come back as a Buffer.
 */
export async function api<T = unknown>(
  path: string,
  options: { method?: string, body?: unknown } = {},
): Promise<ApiResponse<T>> {
  const init: RequestInit = { method: options.method ?? 'GET' }
  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body)
    init.headers = { 'content-type': 'application/json' }
  }

  const res = await handle(new Request(`http://localhost${path}`, init))
  const type = res.headers.get('content-type') ?? ''

  let data: unknown = null
  if (res.status !== 204) {
    if (type.includes('json')) data = await res.json()
    else if (type.includes('text')) data = await res.text()
    else data = Buffer.from(await res.arrayBuffer())
  }

  return { status: res.status, headers: res.headers, data: data as T }
}
