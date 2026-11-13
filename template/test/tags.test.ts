import { beforeEach, describe, expect, it } from 'vitest'
import { api, resetDb, tokenFor } from './helpers'

let token: string

beforeEach(async () => {
  await resetDb()
  token = await tokenFor('admin')
})

const make = (body: Record<string, unknown>) => api('/admin/tags', { method: 'POST', body, token })

describe('public tags', () => {
  it('lists nothing with pagination meta', async () => {
    const { status, json } = await api('/api/tags')
    expect(status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data).toEqual([])
    expect(json.pagination).toEqual({ total: 0, page: 1, limit: 20, totalPages: 1, hasMore: false })
  })

  it('paginates, ordered by name', async () => {
    for (const n of [3, 1, 2]) await make({ name: `Tag ${n}`, slug: `tag-${n}` })
    const { json } = await api('/api/tags?limit=2&page=1')
    expect(json.data.map((t: { slug: string }) => t.slug)).toEqual(['tag-1', 'tag-2'])
    expect(json.pagination).toEqual({ total: 3, page: 1, limit: 2, totalPages: 2, hasMore: true })
    const page2 = await api('/api/tags?limit=2&page=2')
    expect(page2.json.data).toHaveLength(1)
    expect(page2.json.pagination.hasMore).toBe(false)
  })

  it('returns the validation envelope on a bad query', async () => {
    const { status, json } = await api('/api/tags?limit=abc')
    expect(status).toBe(400)
    expect(json.success).toBe(false)
    expect(json.error.code).toBe('VALIDATION_ERROR')
    expect(Array.isArray(json.error.details)).toBe(true)
    expect(typeof json.requestId).toBe('string')
  })

  it('returns a 404 envelope for an unknown slug', async () => {
    const { status, json } = await api('/api/tags/nope')
    expect(status).toBe(404)
    expect(json).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } })
    expect(typeof json.requestId).toBe('string')
  })

  it('gets by slug', async () => {
    await make({ name: 'News', slug: 'news' })
    const { status, json } = await api('/api/tags/news')
    expect(status).toBe(200)
    expect(json.data.name).toBe('News')
  })
})

describe('admin tags', () => {
  it('rejects requests without a token', async () => {
    const routes = [
      ['GET', '/admin/tags'],
      ['POST', '/admin/tags'],
      ['GET', '/admin/tags/x'],
      ['PATCH', '/admin/tags/x'],
      ['DELETE', '/admin/tags/x'],
    ]
    for (const [method, path] of routes) {
      const body = method === 'POST' || method === 'PATCH' ? {} : undefined
      const { status, json } = await api(path, { method, body })
      expect(status, `${method} ${path}`).toBe(401)
      expect(json.success).toBe(false)
      expect(json.error.code).toBe('UNAUTHORIZED')
    }
  })

  it('rejects a garbage token', async () => {
    const { status, json } = await api('/admin/tags', { token: 'garbage' })
    expect(status).toBe(401)
    expect(json.error.code).toBe('INVALID_TOKEN')
  })

  it('lets an editor in too', async () => {
    const { status } = await api('/admin/tags', { token: await tokenFor('editor') })
    expect(status).toBe(200)
  })

  it('creates with 201', async () => {
    const { status, json } = await make({ name: 'News', slug: 'news' })
    expect(status).toBe(201)
    expect(json.success).toBe(true)
    expect(json.data).toMatchObject({ name: 'News', slug: 'news' })
    expect(typeof json.data.id).toBe('string')
  })

  it('validates the create body', async () => {
    const { status, json } = await make({ slug: 'no-name' })
    expect(status).toBe(400)
    expect(json.error.code).toBe('VALIDATION_ERROR')
  })

  it('rejects a duplicate slug with 409', async () => {
    await make({ name: 'A', slug: 'dup' })
    const { status, json } = await make({ name: 'B', slug: 'dup' })
    expect(status).toBe(409)
    expect(json).toMatchObject({ success: false, error: { code: 'CONFLICT' } })
  })

  it('gets by id and 404s on unknown id', async () => {
    const id = (await make({ name: 'A', slug: 'a' })).json.data.id
    const found = await api(`/admin/tags/${id}`, { token })
    expect(found.status).toBe(200)
    expect(found.json.data.id).toBe(id)
    const missing = await api('/admin/tags/missing', { token })
    expect(missing.status).toBe(404)
    expect(missing.json.error.code).toBe('NOT_FOUND')
  })

  it('patches only the fields sent', async () => {
    const id = (await make({ name: 'A', slug: 'a' })).json.data.id
    const renamed = await api(`/admin/tags/${id}`, { method: 'PATCH', body: { name: 'B' }, token })
    expect(renamed.status).toBe(200)
    expect(renamed.json.data).toMatchObject({ name: 'B', slug: 'a' })
    const reslugged = await api(`/admin/tags/${id}`, { method: 'PATCH', body: { slug: 'c' }, token })
    expect(reslugged.json.data).toMatchObject({ name: 'B', slug: 'c' })
  })

  it('patch to an existing slug is a 409, own slug is fine', async () => {
    await make({ name: 'A', slug: 'a' })
    const b = (await make({ name: 'B', slug: 'b' })).json.data.id
    const clash = await api(`/admin/tags/${b}`, { method: 'PATCH', body: { slug: 'a' }, token })
    expect(clash.status).toBe(409)
    const same = await api(`/admin/tags/${b}`, { method: 'PATCH', body: { slug: 'b' }, token })
    expect(same.status).toBe(200)
  })

  it('deletes, then 404s, and frees the slug', async () => {
    const id = (await make({ name: 'A', slug: 'gone' })).json.data.id
    const del = await api(`/admin/tags/${id}`, { method: 'DELETE', token })
    expect(del.status).toBe(200)
    expect(del.json.data).toEqual({ id })

    expect((await api(`/admin/tags/${id}`, { token })).status).toBe(404)
    expect((await api('/api/tags/gone')).status).toBe(404)
    expect((await api('/api/tags')).json.data).toEqual([])

    const again = await make({ name: 'A2', slug: 'gone' })
    expect(again.status).toBe(201)
  })
})
