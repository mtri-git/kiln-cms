import { sign } from 'hono/jwt'
import type { WorkerEnv } from 'kiln-cms'
import { afterAll, inject } from 'vitest'
import { getPlatformProxy } from 'wrangler'
import worker from '../src/worker'

export const TEST_JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long'

// One isolated in-memory D1 + R2 per test file (persist: false never touches .wrangler/state).
// Vars from wrangler.jsonc / .dev.vars are overridden below so tests are deterministic.
const proxy = await getPlatformProxy<WorkerEnv>({ persist: false })
const DB = proxy.env.DB

const env: WorkerEnv = {
  ...proxy.env,
  NODE_ENV: 'test',
  JWT_SECRET: TEST_JWT_SECRET,
  CORS_ALLOW_LIST: '*',
  R2_PUBLIC_URL: '',
}

for (const sql of inject('schemaSql')) await DB.exec(sql.replace(/\s*\n\s*/g, ' ').trim())

afterAll(async () => {
  await proxy.dispose()
})

export { env }

export type ApiOptions = {
  method?: string
  body?: unknown
  token?: string
  headers?: Record<string, string>
}

export type ApiResult<T = any> = { status: number; json: T; res: Response }

/** Sends a request through the Worker's fetch. `json` is the parsed body (undefined if not JSON). */
export async function api<T = any>(path: string, opts: ApiOptions = {}): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { ...opts.headers }
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`
  let body: string | undefined
  if (opts.body !== undefined) {
    body = JSON.stringify(opts.body)
    headers['Content-Type'] ??= 'application/json'
  }
  const method = opts.method ?? (opts.body !== undefined ? 'POST' : 'GET')
  const req = new Request(`http://localhost${path}`, { method, headers, body })
  // Background work (change hooks) is awaited before returning, so tests can assert on it.
  const background: Promise<unknown>[] = []
  const ctx = {
    waitUntil: (promise: Promise<unknown>) => void background.push(promise),
    passThroughOnException() {},
  } as unknown as ExecutionContext
  const res = await worker.fetch(req, env, ctx)
  await Promise.all(background)
  const text = await res.text()
  let json: T = undefined as T
  if ((res.headers.get('content-type') ?? '').includes('json')) json = JSON.parse(text)
  return { status: res.status, json, res }
}

/** A valid access token signed with the test secret. Does not need the users table. */
export function tokenFor(
  role: 'admin' | 'editor',
  overrides: { userId?: string; email?: string; expiresInSeconds?: number } = {},
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  return sign(
    {
      userId: overrides.userId ?? `test-${role}-id`,
      email: overrides.email ?? `${role}@test.local`,
      role,
      iat: now,
      exp: now + (overrides.expiresInSeconds ?? 900),
    },
    TEST_JWT_SECRET,
  )
}

/** Deletes every row of every app table. Call in beforeEach. */
export async function resetDb(): Promise<void> {
  const { results: all } = await DB.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all<{
    name: string
  }>()
  const results = all.filter((t) => !/^(sqlite_|_cf_|d1_)/.test(t.name))
  if (!results.length) return
  await DB.exec('PRAGMA foreign_keys = OFF')
  await DB.batch(results.map((t) => DB.prepare(`DELETE FROM "${t.name}"`)))
  await DB.exec('PRAGMA foreign_keys = ON')
}
