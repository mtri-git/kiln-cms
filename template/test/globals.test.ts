import { z } from '@hono/zod-openapi'
import { type ChangeEvent, type KilnOptions, onChange } from 'kiln-cms'
import { beforeEach, expect, it } from 'vitest'
import { buildApp, resetDb, tokenFor } from './helpers'

// The template declares no globals: each test builds a small app that does.

const homepage = z.object({
  heading: z.string().min(1),
  links: z.array(z.object({ label: z.string(), url: z.string() })).default([]),
})

const options: Partial<KilnOptions> = {
  globals: {
    homepage: { schema: homepage },
    settings: { schema: z.object({ secret: z.string() }), public: false },
  },
}

async function call(path: string, init: { method?: string; body?: unknown; token?: string } = {}, opts = options) {
  const app = buildApp({ registerRoutes: () => {}, ...opts })
  const headers: Record<string, string> = {}
  if (init.token) headers.Authorization = `Bearer ${init.token}`
  if (init.body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await app(
    new Request(`http://localhost${path}`, {
      method: init.method ?? 'GET',
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    }),
  )
  return { status: res.status, json: (await res.json()) as any }
}

beforeEach(resetDb)

it('returns null data until the global is first saved', async () => {
  const res = await call('/api/globals/homepage')
  expect(res.status).toBe(200)
  expect(res.json.data).toEqual({ name: 'homepage', data: null, updatedAt: null })
})

it('saves a global, validates it with its schema and serves it publicly', async () => {
  const token = await tokenFor('editor')
  const bad = await call('/admin/globals/homepage', { method: 'PUT', body: { heading: '' }, token })
  expect(bad.status).toBe(400)
  expect(bad.json.error.code).toBe('VALIDATION_ERROR')

  const saved = await call('/admin/globals/homepage', { method: 'PUT', body: { heading: 'Hi' }, token })
  expect(saved.status).toBe(200)
  expect(saved.json.data.data).toEqual({ heading: 'Hi', links: [] })
  expect(saved.json.data.updatedAt).toEqual(expect.any(String))

  const again = await call('/admin/globals/homepage', {
    method: 'PUT',
    body: { heading: 'Hello', links: [{ label: 'A', url: '/a' }] },
    token,
  })
  expect(again.json.data.data.heading).toBe('Hello')

  const read = await call('/api/globals/homepage')
  expect(read.json.data.data).toEqual({ heading: 'Hello', links: [{ label: 'A', url: '/a' }] })
})

it('needs a token to write or to read through /admin', async () => {
  expect((await call('/admin/globals/homepage', { method: 'PUT', body: { heading: 'x' } })).status).toBe(401)
  expect((await call('/admin/globals/homepage')).status).toBe(401)
})

it('keeps a non-public global out of /api', async () => {
  const token = await tokenFor('admin')
  expect((await call('/api/globals/settings')).status).toBe(404)
  await call('/admin/globals/settings', { method: 'PUT', body: { secret: 's' }, token })
  expect((await call('/admin/globals/settings', { token })).json.data.data).toEqual({ secret: 's' })
})

it('answers 404 for a name that was not declared', async () => {
  const token = await tokenFor('admin')
  expect((await call('/api/globals/nope')).status).toBe(404)
  expect((await call('/admin/globals/nope', { method: 'PUT', body: {}, token })).status).toBe(404)
})

it('moves with basePath and reports the change', async () => {
  const events: ChangeEvent[] = []
  const off = onChange((event) => void events.push(event))
  try {
    const token = await tokenFor('admin')
    const opts = { ...options, basePath: '/cms' }
    const res = await call('/cms/admin/globals/homepage', { method: 'PUT', body: { heading: 'x' }, token }, opts)
    expect(res.status).toBe(200)
    expect((await call('/cms/api/globals/homepage', {}, opts)).json.data.data.heading).toBe('x')
    expect(events).toEqual([{ resource: 'globals', action: 'updated', id: 'homepage' }])
  } finally {
    off()
  }
})

it('rejects a name that cannot go in a URL', () => {
  expect(() => buildApp({ registerRoutes: () => {}, globals: { 'Home Page': { schema: z.object({}) } } })).toThrow(
    /lowercase/,
  )
})
