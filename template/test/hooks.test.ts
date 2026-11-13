import { type ChangeEvent, onChange } from 'kiln-cms'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { api, resetDb, tokenFor } from './helpers'

let events: ChangeEvent[] = []
let stop: (() => void)[] = []
const listen = () => stop.push(onChange((event) => void events.push(event)))

beforeEach(async () => {
  await resetDb()
  events = []
})
afterEach(() => {
  for (const off of stop) off()
  stop = []
})

it('reports every write to a post, in order', async () => {
  listen()
  const token = await tokenFor('admin')
  const created = await api('/admin/posts', { body: { title: 'Hello', slug: 'hello' }, token })
  expect(created.status).toBe(201)
  const id = created.json.data.id

  await api(`/admin/posts/${id}`, { method: 'PATCH', body: { title: 'Hello again' }, token })
  await api(`/admin/posts/${id}/publish`, { method: 'POST', token })
  await api(`/admin/posts/${id}/unpublish`, { method: 'POST', token })
  await api(`/admin/posts/${id}`, { method: 'DELETE', token })

  expect(events).toEqual(
    ['created', 'updated', 'published', 'unpublished', 'deleted'].map((action) => ({ resource: 'posts', action, id })),
  )
})

it('reports category and tag writes', async () => {
  listen()
  const token = await tokenFor('admin')
  const category = await api('/admin/categories', { body: { name: 'News', slug: 'news' }, token })
  const tag = await api('/admin/tags', { body: { name: 'Tip', slug: 'tip' }, token })
  await api(`/admin/tags/${tag.json.data.id}`, { method: 'DELETE', token })

  expect(events).toEqual([
    { resource: 'categories', action: 'created', id: category.json.data.id },
    { resource: 'tags', action: 'created', id: tag.json.data.id },
    { resource: 'tags', action: 'deleted', id: tag.json.data.id },
  ])
})

it('reports nothing for reads or failed writes', async () => {
  listen()
  const token = await tokenFor('admin')
  await api('/api/posts')
  const invalid = await api('/admin/categories', { body: { name: '' }, token })
  expect(invalid.status).toBe(400)
  const missing = await api('/admin/categories/nope', { method: 'DELETE', token })
  expect(missing.status).toBe(404)
  expect(events).toEqual([])
})

it('a failing handler does not fail the request or stop other handlers', async () => {
  stop.push(
    onChange(() => {
      throw new Error('boom')
    }),
  )
  listen()
  const token = await tokenFor('admin')
  const created = await api('/admin/categories', { body: { name: 'News', slug: 'news' }, token })
  expect(created.status).toBe(201)
  expect(events).toHaveLength(1)
})

it('stops calling a handler once it is removed', async () => {
  const off = onChange((event) => void events.push(event))
  off()
  const token = await tokenFor('admin')
  await api('/admin/categories', { body: { name: 'News', slug: 'news' }, token })
  expect(events).toEqual([])
})
