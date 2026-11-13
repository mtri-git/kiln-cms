import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sign } from 'hono/jwt'
import { createHandler, type FileStorage, type KilnOptions } from 'kiln-cms'
import { afterAll, inject } from 'vitest'
import { appOptions } from '../src/app'

export const TEST_JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long'

/**
 * Every test file runs twice (see vitest.config.ts): on the Cloudflare adapter (in-memory D1 + R2 from wrangler)
 * and on the Node/Bun adapter (a SQLite file through libSQL + a folder, both in a temp dir).
 * Vars are fixed here so tests are deterministic.
 */
export const runtime: 'cloudflare' | 'node' = process.env.KILN_TEST_RUNTIME === 'node' ? 'node' : 'cloudflare'

const vars = { NODE_ENV: 'test', JWT_SECRET: TEST_JWT_SECRET, CORS_ALLOW_LIST: '*', FILES_PUBLIC_URL: '' }

type Backend = {
  env: Record<string, unknown>
  storage: FileStorage
  /** Builds a request handler for these options. Background work is awaited before it returns. */
  build: (options: KilnOptions) => (request: Request) => Promise<Response>
  /** One raw SQL statement. Returns the rows. */
  execute: (sql: string, args?: (string | number | null)[]) => Promise<Record<string, unknown>[]>
  dispose: () => Promise<void>
}

async function cloudflareBackend(): Promise<Backend> {
  const { getPlatformProxy } = await import('wrangler')
  const { createWorker, r2Storage } = await import('kiln-cms/cloudflare')
  // persist: false never touches .wrangler/state.
  const proxy = await getPlatformProxy<{ DB: D1Database; BUCKET: R2Bucket }>({ persist: false })
  const env = { ...proxy.env, ...vars }
  return {
    env,
    storage: r2Storage(proxy.env.BUCKET),
    build: (options) => {
      const worker = createWorker(options)
      return async (request) => {
        const background: Promise<unknown>[] = []
        const ctx = {
          waitUntil: (promise: Promise<unknown>) => void background.push(promise),
          passThroughOnException() {},
        } as unknown as ExecutionContext
        const res = await worker.fetch(request, env, ctx)
        await Promise.all(background)
        return res
      }
    },
    execute: async (sql, args = []) => {
      const { results } = await proxy.env.DB.prepare(sql)
        .bind(...args)
        .all<Record<string, unknown>>()
      return results
    },
    dispose: () => proxy.dispose(),
  }
}

async function nodeBackend(): Promise<Backend> {
  const { createSqliteRuntime } = await import('kiln-cms/node')
  const dir = await mkdtemp(join(tmpdir(), 'kiln-test-'))
  const sqlite = await createSqliteRuntime({
    databaseUrl: `file:${join(dir, 'test.db').replace(/\\/g, '/')}`,
    filesDir: join(dir, 'files'),
    migrationsFolder: false,
  })
  const env = { ...vars }
  return {
    env,
    storage: sqlite.storage,
    build: (options) => {
      const handle = createHandler(options)
      return async (request) => {
        const background: Promise<unknown>[] = []
        const res = await handle(request, {
          env,
          db: sqlite.db,
          storage: sqlite.storage,
          // What a proxy header would give; the rate limit tests send it.
          clientIp: request.headers.get('CF-Connecting-IP') ?? undefined,
          waitUntil: (promise) => void background.push(promise),
        })
        await Promise.all(background)
        return res
      }
    },
    execute: async (sql, args) => (await sqlite.execute(sql, args)).rows,
    dispose: async () => {
      sqlite.close()
      // Windows can keep the database file locked for a moment after close: the temp dir is only best effort.
      await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => {})
    },
  }
}

const backend = runtime === 'node' ? await nodeBackend() : await cloudflareBackend()

for (const sql of inject('schemaSql')) await backend.execute(sql.replace(/\s*\n\s*/g, ' ').trim())

afterAll(async () => {
  await backend.dispose()
})

export const { env, storage, execute } = backend

/** The template app (src/app.ts) on the runtime under test. */
export const fetchApp = backend.build(appOptions)

/** A one-off app with other options, on the runtime under test. */
export const buildApp = backend.build

export type ApiOptions = {
  method?: string
  body?: unknown
  token?: string
  headers?: Record<string, string>
}

export type ApiResult<T = any> = { status: number; json: T; res: Response }

/** Sends a request through the app. `json` is the parsed body (undefined if not JSON). */
export async function api<T = any>(path: string, opts: ApiOptions = {}): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { ...opts.headers }
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`
  let body: string | undefined
  if (opts.body !== undefined) {
    body = JSON.stringify(opts.body)
    headers['Content-Type'] ??= 'application/json'
  }
  const method = opts.method ?? (opts.body !== undefined ? 'POST' : 'GET')
  const res = await fetchApp(new Request(`http://localhost${path}`, { method, headers, body }))
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
  const tables = (await execute(`SELECT name FROM sqlite_master WHERE type = 'table'`))
    .map((row) => String(row.name))
    .filter((name) => !/^(sqlite_|_cf_|d1_|__drizzle)/.test(name))
  if (!tables.length) return
  await execute('PRAGMA foreign_keys = OFF')
  for (const name of tables) await execute(`DELETE FROM "${name}"`)
  await execute('PRAGMA foreign_keys = ON')
}
