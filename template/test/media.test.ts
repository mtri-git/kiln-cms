import { beforeEach, describe, expect, it } from 'vitest'
import worker from '../src/worker'
import { api, env, resetDb, tokenFor } from './helpers'

let token: string

beforeEach(async () => {
  await resetDb()
  token = await tokenFor('admin')
})

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])

/** Like helpers.api, but sends a FormData body (the helper only sends JSON). */
async function upload(form: FormData, opts: { token?: string; path?: string; method?: string } = {}) {
  const headers: Record<string, string> = {}
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`
  const req = new Request(`http://localhost${opts.path ?? '/admin/media'}`, {
    method: opts.method ?? 'POST',
    headers,
    body: form,
  })
  const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext
  const res = await worker.fetch(req, env, ctx)
  const text = await res.text()
  const json = (res.headers.get('content-type') ?? '').includes('json') ? JSON.parse(text) : undefined
  return { status: res.status, json, res }
}

function pngForm(name = 'photo.png', extra: Record<string, string> = {}, type = 'image/png', bytes: BlobPart = PNG) {
  const form = new FormData()
  form.append('file', new File([bytes], name, { type }))
  for (const [k, v] of Object.entries(extra)) form.append(k, v)
  return form
}

const put = (name = 'photo.png', extra: Record<string, string> = {}) => upload(pngForm(name, extra), { token })

describe('upload', () => {
  it('uploads a PNG and returns the media item', async () => {
    const { status, json } = await put('photo.png', { alt: 'A photo', width: '640', height: '480' })
    expect(status).toBe(201)
    expect(json.success).toBe(true)
    const d = json.data
    expect(typeof d.id).toBe('string')
    expect(d.key).toMatch(/^\d{4}\/\d{2}\/[0-9A-Za-z]{12}-photo\.png$/)
    expect(d).toMatchObject({
      fileName: 'photo.png',
      contentType: 'image/png',
      size: PNG.byteLength,
      alt: 'A photo',
      width: 640,
      height: 480,
    })
    expect(d.url.endsWith(`/${d.key}`)).toBe(true)
    expect(d.url).toBe(`http://localhost/files/${d.key}`)
  })

  it('stores null alt/width/height when not sent', async () => {
    const { json } = await put()
    expect(json.data).toMatchObject({ alt: null, width: null, height: null })
  })

  it('serves the file back with the same bytes, type and cache header', async () => {
    const { json } = await put()
    const res = await api(`/files/${json.data.key}`)
    expect(res.status).toBe(200)
    expect(res.res.headers.get('content-type')).toBe('image/png')
    expect(res.res.headers.get('cache-control')).toMatch(/max-age=31536000/)
    const again = await worker.fetch(new Request(`http://localhost/files/${json.data.key}`), env, {
      waitUntil() {},
      passThroughOnException() {},
    } as unknown as ExecutionContext)
    expect(new Uint8Array(await again.arrayBuffer())).toEqual(PNG)
  })

  it('sanitizes spaces, uppercase and unicode in the key', async () => {
    const { status, json } = await put('Ảnh Đẹp  Của TÔI (1).PNG')
    expect(status).toBe(201)
    expect(json.data.key).toMatch(/^[a-z0-9./-]+$/i)
    const name = json.data.key.split('/')[2].slice(13)
    expect(name).toMatch(/^[a-z0-9.-]+$/)
    expect(name.endsWith('.png')).toBe(true)
    expect(json.data.fileName).toBe('Ảnh Đẹp  Của TÔI (1).PNG')
    expect((await api(`/files/${json.data.key}`)).status).toBe(200)
  })

  it('falls back to a safe name when nothing survives sanitizing', async () => {
    const { status, json } = await put('日本語')
    expect(status).toBe(201)
    expect(json.data.key).toMatch(/^\d{4}\/\d{2}\/[0-9A-Za-z]{12}-[a-z0-9.-]+$/)
  })

  it('rejects a disallowed content type with 400', async () => {
    const { status, json } = await upload(pngForm('x.html', {}, 'text/html', '<b>hi</b>'), { token })
    expect(status).toBe(400)
    expect(json.success).toBe(false)
  })

  it('rejects a file over 10 MB with 400', async () => {
    const big = new Uint8Array(10 * 1024 * 1024 + 1)
    const { status, json } = await upload(pngForm('big.png', {}, 'image/png', big), { token })
    expect(status).toBe(400)
    expect(json.success).toBe(false)
  })

  it('accepts a file of exactly 10 MB', async () => {
    const big = new Uint8Array(10 * 1024 * 1024)
    const { status } = await upload(pngForm('edge.png', {}, 'image/png', big), { token })
    expect(status).toBe(201)
  })

  it('rejects a missing file field with 400', async () => {
    const form = new FormData()
    form.append('alt', 'no file')
    const { status, json } = await upload(form, { token })
    expect(status).toBe(400)
    expect(json.error.code).toBe('VALIDATION_ERROR')
  })

  it('rejects a text value in the file field with 400', async () => {
    const form = new FormData()
    form.append('file', 'not a file')
    const { status } = await upload(form, { token })
    expect(status).toBe(400)
  })

  it('rejects an invalid width with 400', async () => {
    const { status } = await put('a.png', { width: '-5' })
    expect(status).toBe(400)
  })

  it('rejects a request without a token', async () => {
    const { status, json } = await upload(pngForm())
    expect(status).toBe(401)
    expect(json.error.code).toBe('UNAUTHORIZED')
  })

  it('lets an editor upload', async () => {
    const { status } = await upload(pngForm(), { token: await tokenFor('editor') })
    expect(status).toBe(201)
  })
})

describe('admin media', () => {
  it('rejects requests without a token', async () => {
    for (const [method, path] of [
      ['GET', '/admin/media'],
      ['GET', '/admin/media/x'],
      ['PATCH', '/admin/media/x'],
      ['DELETE', '/admin/media/x'],
    ]) {
      const { status } = await api(path, { method, body: method === 'PATCH' ? {} : undefined })
      expect(status, `${method} ${path}`).toBe(401)
    }
  })

  it('lists newest first with pagination', async () => {
    const ids: string[] = []
    for (const n of [1, 2, 3]) {
      ids.push((await put(`file-${n}.png`)).json.data.id)
      await new Promise((r) => setTimeout(r, 1100)) // createdAt has second resolution
    }
    const list = await api('/admin/media?limit=2&page=1', { token })
    expect(list.status).toBe(200)
    expect(list.json.data.map((m: { id: string }) => m.id)).toEqual([ids[2], ids[1]])
    expect(list.json.pagination).toEqual({ total: 3, page: 1, limit: 2, totalPages: 2, hasMore: true })
    const page2 = await api('/admin/media?limit=2&page=2', { token })
    expect(page2.json.data.map((m: { id: string }) => m.id)).toEqual([ids[0]])
    expect(page2.json.pagination.hasMore).toBe(false)
  }, 20000)

  it('searches by file name', async () => {
    await put('Holiday.png')
    await put('invoice.png')
    const { json } = await api('/admin/media?search=holi', { token })
    expect(json.data).toHaveLength(1)
    expect(json.data[0].fileName).toBe('Holiday.png')
    expect(json.pagination.total).toBe(1)
    expect((await api('/admin/media?search=zzz', { token })).json.data).toEqual([])
  })

  it('gets by id and 404s on unknown id', async () => {
    const id = (await put()).json.data.id
    const found = await api(`/admin/media/${id}`, { token })
    expect(found.status).toBe(200)
    expect(found.json.data.id).toBe(id)
    expect(found.json.data.url).toContain('/files/')
    const missing = await api('/admin/media/missing', { token })
    expect(missing.status).toBe(404)
    expect(missing.json.error.code).toBe('NOT_FOUND')
  })

  it('patches alt and null clears it', async () => {
    const id = (await put('a.png', { alt: 'old', width: '10', height: '20' })).json.data.id
    const set = await api(`/admin/media/${id}`, { method: 'PATCH', body: { alt: 'new' }, token })
    expect(set.status).toBe(200)
    expect(set.json.data).toMatchObject({ alt: 'new', width: 10, height: 20 })
    const cleared = await api(`/admin/media/${id}`, { method: 'PATCH', body: { alt: null }, token })
    expect(cleared.json.data).toMatchObject({ alt: null, width: 10, height: 20 })
  })

  it('patch on an unknown id is 404', async () => {
    const { status } = await api('/admin/media/missing', { method: 'PATCH', body: { alt: 'x' }, token })
    expect(status).toBe(404)
  })

  it('deletes the row and the R2 object', async () => {
    const { id, key } = (await put()).json.data
    expect((await api(`/files/${key}`)).status).toBe(200)
    const del = await api(`/admin/media/${id}`, { method: 'DELETE', token })
    expect(del.status).toBe(200)
    expect(del.json.data).toEqual({ id })
    expect((await api(`/admin/media/${id}`, { token })).status).toBe(404)
    expect((await api(`/files/${key}`)).status).toBe(404)
    expect(await env.BUCKET.head(key)).toBeNull()
    expect((await api('/admin/media', { token })).json.data).toEqual([])
    expect((await api(`/admin/media/${id}`, { method: 'DELETE', token })).status).toBe(404)
  })
})

describe('public files', () => {
  it('404s on an unknown key', async () => {
    const { status, json } = await api('/files/2020/01/nope.png')
    expect(status).toBe(404)
    expect(json.error.code).toBe('NOT_FOUND')
  })

  it('404s on the bare /files/ path', async () => {
    const { status } = await api('/files/')
    expect(status).toBeGreaterThanOrEqual(400)
    expect(status).toBeLessThan(500)
  })

  it('rejects a key containing ..', async () => {
    for (const path of ['/files/a..b', '/files/%2E%2E%2Fsecret', '/files/..%2Fsecret', '/files/x/%2e%2e/y']) {
      const { status } = await api(path)
      expect(status, path).toBeGreaterThanOrEqual(400)
      expect(status, path).toBeLessThan(500)
    }
  })

  it('returns a 4xx for a malformed percent-encoded key', async () => {
    const { status } = await api('/files/%E0%A4%A')
    expect(status).toBeGreaterThanOrEqual(400)
    expect(status).toBeLessThan(500)
  })
})

describe('openapi', () => {
  it('/openapi.json includes the media paths with a binary file field', async () => {
    const { status, json } = await api('/openapi.json')
    expect(status).toBe(200)
    expect(Object.keys(json.paths)).toEqual(expect.arrayContaining(['/admin/media', '/admin/media/{id}']))
    const body = json.paths['/admin/media'].post.requestBody.content['multipart/form-data'].schema
    const schema = body.$ref ? json.components.schemas[body.$ref.split('/').pop()] : body
    expect(schema.properties.file).toMatchObject({ type: 'string', format: 'binary' })
    expect(schema.required).toContain('file')
  })
})
