import { sql } from 'drizzle-orm'
import { type AppEnv, createRouter, createWorker, db, getEnv, type KilnOptions, ok } from 'kiln-cms'
import { expect, it } from 'vitest'
import { env } from './helpers'

// Options of createWorker that the template itself does not use: each test builds its own small Worker.

type Routes = KilnOptions['registerRoutes']

async function call(options: Partial<KilnOptions>, path: string, init?: RequestInit) {
  const worker = createWorker({ registerRoutes: () => {}, ...options })
  const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext
  const res = await worker.fetch(new Request(`http://localhost${path}`, init), env, ctx)
  const isJson = (res.headers.get('content-type') ?? '').includes('json')
  return { status: res.status, json: isJson ? await res.json<any>() : undefined }
}

it('basePath moves the built-in routes and leaves the app routes where the app puts them', async () => {
  const registerRoutes: Routes = (app) => {
    const router = createRouter()
    router.get('/ping', (c) => ok(c, { pong: true }))
    app.route('/outside', router)
  }
  const options = { basePath: '/api', registerRoutes }

  expect((await call(options, '/api/health')).status).toBe(200)
  expect((await call(options, '/health')).status).toBe(404)
  expect((await call(options, '/api/auth/login', { method: 'POST', body: '{}' })).status).not.toBe(404)
  expect((await call(options, '/auth/login', { method: 'POST', body: '{}' })).status).toBe(404)
  expect((await call(options, '/api/admin/users')).status).toBe(401)
  expect((await call(options, '/outside/ping')).json.data).toEqual({ pong: true })

  const doc = await call(options, '/api/openapi.json')
  expect(Object.keys(doc.json.paths)).toContain('/api/auth/login')
  expect((await call(options, '/api/docs')).status).toBe(200)
})

it('basePath accepts a value with or without slashes', async () => {
  for (const basePath of ['api', '/api/', '/api']) {
    expect((await call({ basePath }, '/api/health')).status).toBe(200)
  }
  expect((await call({ basePath: '/' }, '/health')).status).toBe(200)
})

it('builtInAuth: false leaves out /auth and /admin/users', async () => {
  const options = { builtInAuth: false }
  expect((await call(options, '/health')).status).toBe(200)
  expect((await call(options, '/auth/login', { method: 'POST', body: '{}' })).status).toBe(404)
  expect((await call(options, '/admin/users')).status).toBe(404)
  const doc = await call(options, '/openapi.json')
  expect(Object.keys(doc.json.paths)).toEqual([])
})

it('an app can sign users in with its own middleware', async () => {
  const registerRoutes: Routes = (app) => {
    const admin = createRouter()
    admin.use('*', async (c, next) => {
      c.set('user', { userId: 'access:me@example.com', email: 'me@example.com', role: 'admin' })
      await next()
    })
    admin.get('/me', (c) => ok(c, c.get('user')))
    app.route('/admin', admin)
  }
  const me = await call({ builtInAuth: false, registerRoutes }, '/admin/me')
  expect(me.json.data.email).toBe('me@example.com')
})

it('getEnv reads bindings that WorkerEnv does not know', async () => {
  type MyEnv = { MEDIA: R2Bucket; SITE_URL: string }
  const registerRoutes: Routes = (app) => {
    app.get('/env', (c) => ok(c, { site: getEnv<MyEnv>().SITE_URL ?? null }))
  }
  expect((await call({ registerRoutes }, '/env')).json.data).toEqual({ site: null })
})

it('a broken UNIQUE constraint answers 409, not 500', async () => {
  const registerRoutes: Routes = (app) => {
    app.post('/twice', async (c: import('hono').Context<AppEnv>) => {
      await db.run(sql`CREATE TABLE IF NOT EXISTS uniq_test (name TEXT PRIMARY KEY)`)
      await db.run(sql`INSERT INTO uniq_test (name) VALUES ('a')`)
      await db.run(sql`INSERT INTO uniq_test (name) VALUES ('a')`)
      return ok(c, {})
    })
  }
  const res = await call({ registerRoutes }, '/twice', { method: 'POST' })
  expect(res.status).toBe(409)
  expect(res.json.error.code).toBe('CONFLICT')
})

it('answers a CORS preflight for PUT', async () => {
  const worker = createWorker({ registerRoutes: () => {} })
  const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext
  const res = await worker.fetch(
    new Request('http://localhost/health', {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'PUT' },
    }),
    env,
    ctx,
  )
  expect(res.headers.get('access-control-allow-methods')).toContain('PUT')
})
