import { signWebhook, verifyWebhook } from 'kiln-cms'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { api, env, resetDb, tokenFor } from './helpers'

type Sent = { url: string; headers: Headers; body: string }
let sent: Sent[] = []
/** What the fake receiver answers, one status per call; 200 once the list is used up. */
let statuses: number[] = []

const setEnv = (vars: Record<string, string>) => Object.assign(env, vars)

beforeEach(async () => {
  await resetDb()
  sent = []
  statuses = []
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init)
    sent.push({ url: request.url, headers: request.headers, body: await request.text() })
    return new Response('ok', { status: statuses.shift() ?? 200 })
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  for (const key of ['WEBHOOK_URLS', 'WEBHOOK_SECRET', 'WEBHOOK_EVENTS']) delete (env as Record<string, unknown>)[key]
})

const createCategory = async () => {
  const res = await api('/admin/categories', { body: { name: 'News', slug: 'news' }, token: await tokenFor('admin') })
  return res.json.data.id as string
}

it('sends nothing while WEBHOOK_URLS is empty', async () => {
  await createCategory()
  expect(sent).toEqual([])
})

it('posts every change to every URL, signed', async () => {
  setEnv({ WEBHOOK_URLS: 'https://a.test/hook | https://b.test/hook', WEBHOOK_SECRET: 'shh' })
  const id = await createCategory()

  expect(sent.map((s) => s.url).sort()).toEqual(['https://a.test/hook', 'https://b.test/hook'])
  const [first, second] = sent
  const payload = JSON.parse(first.body)
  expect(payload).toMatchObject({ event: 'categories.created', resource: 'categories', action: 'created', id })
  expect(Number.isNaN(Date.parse(payload.occurredAt))).toBe(false)
  expect(first.headers.get('content-type')).toBe('application/json')
  expect(first.headers.get('x-kiln-event')).toBe('categories.created')
  expect(first.headers.get('x-kiln-delivery')).toBe(second.headers.get('x-kiln-delivery'))

  const timestamp = first.headers.get('x-kiln-timestamp')
  const signature = first.headers.get('x-kiln-signature')
  expect(signature).toBe(await signWebhook('shh', Number(timestamp), first.body))
  expect(await verifyWebhook({ secret: 'shh', body: first.body, timestamp, signature })).toBe(true)
  expect(await verifyWebhook({ secret: 'other', body: first.body, timestamp, signature })).toBe(false)
  expect(await verifyWebhook({ secret: 'shh', body: `${first.body} `, timestamp, signature })).toBe(false)
})

it('sends no signature without a secret', async () => {
  setEnv({ WEBHOOK_URLS: 'https://a.test/hook' })
  await createCategory()
  expect(sent).toHaveLength(1)
  expect(sent[0].headers.get('x-kiln-signature')).toBeNull()
})

it('sends only the events in WEBHOOK_EVENTS', async () => {
  setEnv({ WEBHOOK_URLS: 'https://a.test/hook', WEBHOOK_EVENTS: 'posts.published|*.deleted' })
  const token = await tokenFor('admin')
  const post = await api('/admin/posts', { body: { title: 'Hello', slug: 'hello' }, token })
  const id = post.json.data.id
  await api(`/admin/posts/${id}`, { method: 'PATCH', body: { title: 'Hello again' }, token })
  await api(`/admin/posts/${id}/publish`, { method: 'POST', token })
  await api(`/admin/posts/${id}`, { method: 'DELETE', token })

  expect(sent.map((s) => JSON.parse(s.body).event)).toEqual(['posts.published', 'posts.deleted'])
})

it('retries a 5xx with the same delivery id, and does not retry a 4xx', async () => {
  setEnv({ WEBHOOK_URLS: 'https://a.test/hook' })
  statuses = [503]
  await createCategory()
  expect(sent).toHaveLength(2)
  expect(sent[0].headers.get('x-kiln-delivery')).toBe(sent[1].headers.get('x-kiln-delivery'))

  sent = []
  statuses = [404]
  const res = await api('/admin/tags', { body: { name: 'Tip', slug: 'tip' }, token: await tokenFor('admin') })
  expect(res.status).toBe(201)
  expect(sent).toHaveLength(1)
})

it('never fails the request when the receiver is down', async () => {
  setEnv({ WEBHOOK_URLS: 'https://a.test/hook' })
  statuses = [500, 500, 500]
  const res = await api('/admin/categories', { body: { name: 'News', slug: 'news' }, token: await tokenFor('admin') })
  expect(res.status).toBe(201)
  expect(sent).toHaveLength(3)
})

it('rejects an old or unsigned request', async () => {
  const body = '{"event":"posts.published"}'
  const old = Math.floor(Date.now() / 1000) - 600
  const signature = await signWebhook('shh', old, body)
  expect(await verifyWebhook({ secret: 'shh', body, timestamp: String(old), signature })).toBe(false)
  expect(await verifyWebhook({ secret: 'shh', body, timestamp: String(old), signature, toleranceSeconds: 900 })).toBe(
    true,
  )
  expect(await verifyWebhook({ secret: 'shh', body, timestamp: null, signature: null })).toBe(false)
})
