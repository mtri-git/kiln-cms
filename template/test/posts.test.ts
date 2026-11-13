import { beforeEach, describe, expect, it } from 'vitest'
import { api, resetDb, tokenFor } from './helpers'

const USER_ID = 'user-123'
let token: string

beforeEach(async () => {
  await resetDb()
  token = await tokenFor('admin', { userId: USER_ID })
})

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const makePost = (body: Record<string, unknown>) => api('/admin/posts', { method: 'POST', body, token })
const makeTag = async (name: string, slug = name.toLowerCase()) =>
  (await api('/admin/tags', { method: 'POST', body: { name, slug }, token })).json.data.id as string
const makeCategory = async (name: string, slug = name.toLowerCase()) =>
  (await api('/admin/categories', { method: 'POST', body: { name, slug }, token })).json.data.id as string
const publish = (id: string) => api(`/admin/posts/${id}/publish`, { method: 'POST', token })
const unpublish = (id: string) => api(`/admin/posts/${id}/unpublish`, { method: 'POST', token })
const patch = (id: string, body: Record<string, unknown>) => api(`/admin/posts/${id}`, { method: 'PATCH', body, token })
const revisionsOf = async (id: string) => (await api(`/admin/posts/${id}/revisions`, { token })).json.data
const restore = (id: string, revisionId: string) =>
  api(`/admin/posts/${id}/revisions/${revisionId}/restore`, { method: 'POST', token })
const slugs = (json: { data: { slug: string }[] }) => json.data.map((p) => p.slug)
const tagIdsOf = (json: { data: { tags: { id: string }[] } }) => json.data.tags.map((t) => t.id)

/** Creates and publishes a post; sleeps so that publishedAt values differ. */
async function published(body: Record<string, unknown>) {
  const id = (await makePost(body)).json.data.id as string
  await publish(id)
  await sleep(3)
  return id
}

describe('create', () => {
  it('returns 201, forces draft status and sets the author from the token', async () => {
    const { status, json } = await makePost({ title: 'Hello', slug: 'hello', status: 'published', authorId: 'someone' })
    expect(status).toBe(201)
    expect(json.success).toBe(true)
    expect(json.data).toMatchObject({
      title: 'Hello',
      slug: 'hello',
      status: 'draft',
      authorId: USER_ID,
      publishedAt: null,
      isFeatured: false,
      category: null,
      tags: [],
    })
  })

  it('round-trips an arbitrary nested JSON content unchanged', async () => {
    const content = {
      root: {
        type: 'root',
        children: [
          { type: 'paragraph', children: [{ type: 'text', text: 'Hi "there" \\ é \n', format: 1 }], indent: 0 },
          { type: 'list', items: [1, 2.5, null, true, false, [], {}, [[1], { a: { b: [null] } }]] },
        ],
      },
      empty: '',
      zero: 0,
    }
    const created = await makePost({ title: 'C', slug: 'c', content })
    expect(created.json.data.content).toEqual(content)
    const id = created.json.data.id
    const fetched = await api(`/admin/posts/${id}`, { token })
    expect(fetched.json.data.content).toEqual(content)
    await publish(id)
    const pub = await api('/api/posts/c')
    expect(pub.json.data.content).toEqual(content)
  })

  it('returns tags and category as objects', async () => {
    const categoryId = await makeCategory('News', 'news')
    const t1 = await makeTag('Beta', 'beta')
    const t2 = await makeTag('Alpha', 'alpha')
    const { status, json } = await makePost({ title: 'T', slug: 't', categoryId, tagIds: [t1, t2] })
    expect(status).toBe(201)
    expect(json.data.categoryId).toBe(categoryId)
    expect(json.data.category).toEqual({ id: categoryId, name: 'News', slug: 'news' })
    expect(json.data.tags).toHaveLength(2)
    expect(json.data.tags).toEqual(
      expect.arrayContaining([
        { id: t1, name: 'Beta', slug: 'beta' },
        { id: t2, name: 'Alpha', slug: 'alpha' },
      ]),
    )
  })

  it('rejects an unknown category or tag with 400', async () => {
    const badCat = await makePost({ title: 'T', slug: 't', categoryId: 'nope' })
    expect(badCat.status).toBe(400)
    expect(badCat.json.success).toBe(false)
    const goodTag = await makeTag('Real')
    const badTag = await makePost({ title: 'T', slug: 't', tagIds: [goodTag, 'nope'] })
    expect(badTag.status).toBe(400)
    expect((await api('/admin/posts', { token })).json.data).toEqual([])
  })

  it('rejects a duplicate slug with 409', async () => {
    await makePost({ title: 'A', slug: 'dup' })
    const { status, json } = await makePost({ title: 'B', slug: 'dup' })
    expect(status).toBe(409)
    expect(json.error.code).toBe('CONFLICT')
  })

  it('validates the body', async () => {
    const { status, json } = await makePost({ slug: 'no-title' })
    expect(status).toBe(400)
    expect(json.error.code).toBe('VALIDATION_ERROR')
  })

  it('requires a token', async () => {
    const { status, json } = await api('/admin/posts', { body: { title: 'A', slug: 'a' } })
    expect(status).toBe(401)
    expect(json.error.code).toBe('UNAUTHORIZED')
  })
})

describe('public visibility', () => {
  it('hides drafts, shows published, hides again after unpublish keeping publishedAt', async () => {
    const id = (await makePost({ title: 'A', slug: 'a', content: { x: 1 } })).json.data.id

    expect((await api('/api/posts')).json.data).toEqual([])
    expect((await api('/api/posts/a')).status).toBe(404)

    const pub = await publish(id)
    expect(pub.status).toBe(200)
    expect(pub.json.data.status).toBe('published')
    expect(typeof pub.json.data.publishedAt).toBe('string')
    const publishedAt = pub.json.data.publishedAt

    const list = await api('/api/posts')
    expect(slugs(list.json)).toEqual(['a'])
    expect(list.json.pagination.total).toBe(1)
    expect((await api('/api/posts/a')).status).toBe(200)

    const unpub = await unpublish(id)
    expect(unpub.status).toBe(200)
    expect(unpub.json.data.status).toBe('draft')
    expect(unpub.json.data.publishedAt).toBe(publishedAt)
    expect((await api('/api/posts')).json.data).toEqual([])
    expect((await api('/api/posts/a')).status).toBe(404)

    // republishing keeps the original publishedAt
    await sleep(3)
    const again = await publish(id)
    expect(again.json.data.publishedAt).toBe(publishedAt)
  })

  it('omits content in list items but includes it on the single post', async () => {
    await published({ title: 'A', slug: 'a', content: { hello: 'world' } })
    const list = await api('/api/posts')
    expect(list.json.data[0]).not.toHaveProperty('content')
    expect(list.json.data[0]).not.toHaveProperty('deletedAt')
    const one = await api('/api/posts/a')
    expect(one.json.data.content).toEqual({ hello: 'world' })
    const adminList = await api('/admin/posts', { token })
    expect(adminList.json.data[0]).not.toHaveProperty('content')
  })

  it('404s for an unknown slug', async () => {
    const { status, json } = await api('/api/posts/nope')
    expect(status).toBe(404)
    expect(json.error.code).toBe('NOT_FOUND')
  })

  it('publish and unpublish 404 on an unknown id', async () => {
    expect((await publish('missing')).status).toBe(404)
    expect((await unpublish('missing')).status).toBe(404)
  })
})

describe('public filters', () => {
  it('filters by category slug', async () => {
    const news = await makeCategory('News', 'news')
    const tech = await makeCategory('Tech', 'tech')
    await published({ title: 'A', slug: 'a', categoryId: news })
    await published({ title: 'B', slug: 'b', categoryId: tech })
    await published({ title: 'C', slug: 'c' })
    expect(slugs((await api('/api/posts?category=news')).json)).toEqual(['a'])
    expect(slugs((await api('/api/posts?category=tech')).json)).toEqual(['b'])
    const none = await api('/api/posts?category=unknown')
    expect(none.json.data).toEqual([])
    expect(none.json.pagination.total).toBe(0)
  })

  it('filters by tag slug', async () => {
    const x = await makeTag('X', 'x')
    const y = await makeTag('Y', 'y')
    await published({ title: 'A', slug: 'a', tagIds: [x] })
    await published({ title: 'B', slug: 'b', tagIds: [x, y] })
    await published({ title: 'C', slug: 'c' })
    expect(slugs((await api('/api/posts?tag=x')).json).sort()).toEqual(['a', 'b'])
    expect(slugs((await api('/api/posts?tag=y')).json)).toEqual(['b'])
    expect((await api('/api/posts?tag=unknown')).json.data).toEqual([])
  })

  it('filters by featured', async () => {
    await published({ title: 'A', slug: 'a', isFeatured: true })
    await published({ title: 'B', slug: 'b' })
    expect(slugs((await api('/api/posts?featured=true')).json)).toEqual(['a'])
    expect(slugs((await api('/api/posts?featured=false')).json)).toEqual(['b'])
    expect((await api('/api/posts?featured=maybe')).status).toBe(400)
  })

  it('searches titles, case-insensitively, and ignores unpublished posts', async () => {
    await published({ title: 'Learning Rust', slug: 'rust' })
    await published({ title: 'Learning Go', slug: 'go' })
    await makePost({ title: 'Rust draft', slug: 'rust-draft' })
    expect(slugs((await api('/api/posts?search=rust')).json)).toEqual(['rust'])
    expect(slugs((await api('/api/posts?search=Learning')).json).sort()).toEqual(['go', 'rust'])
  })

  it('treats % and _ in search literally', async () => {
    await published({ title: '100% sure', slug: 'percent' })
    await published({ title: 'snake_case', slug: 'underscore' })
    await published({ title: '100 sure', slug: 'plain' })
    await published({ title: 'snakeXcase', slug: 'other' })
    await published({ title: 'back\\slash', slug: 'backslash' })
    const search = async (term: string) => slugs((await api(`/api/posts?search=${encodeURIComponent(term)}`)).json)
    expect(await search('%')).toEqual(['percent'])
    expect(await search('100%')).toEqual(['percent'])
    expect(await search('_')).toEqual(['underscore'])
    expect(await search('e_c')).toEqual(['underscore'])
    expect(await search('\\')).toEqual(['backslash'])
  })

  it('paginates, newest publishedAt first', async () => {
    for (const n of [1, 2, 3]) await published({ title: `P${n}`, slug: `p${n}` })
    const page1 = await api('/api/posts?limit=2&page=1')
    expect(slugs(page1.json)).toEqual(['p3', 'p2'])
    expect(page1.json.pagination).toEqual({ total: 3, page: 1, limit: 2, totalPages: 2, hasMore: true })
    const page2 = await api('/api/posts?limit=2&page=2')
    expect(slugs(page2.json)).toEqual(['p1'])
    expect(page2.json.pagination.hasMore).toBe(false)
  })

  it('orders by publishedAt, not by creation', async () => {
    const a = (await makePost({ title: 'A', slug: 'a' })).json.data.id
    const b = (await makePost({ title: 'B', slug: 'b' })).json.data.id
    await publish(b)
    await sleep(3)
    await publish(a)
    expect(slugs((await api('/api/posts')).json)).toEqual(['a', 'b'])
  })

  it('returns the validation envelope on a bad query', async () => {
    const { status, json } = await api('/api/posts?limit=abc')
    expect(status).toBe(400)
    expect(json.error.code).toBe('VALIDATION_ERROR')
  })
})

describe('admin list and get', () => {
  it('requires a token on every route', async () => {
    const routes = [
      ['GET', '/admin/posts'],
      ['GET', '/admin/posts/x'],
      ['PATCH', '/admin/posts/x'],
      ['DELETE', '/admin/posts/x'],
      ['POST', '/admin/posts/x/publish'],
      ['POST', '/admin/posts/x/unpublish'],
      ['GET', '/admin/posts/x/revisions'],
      ['POST', '/admin/posts/x/revisions/y/restore'],
    ]
    for (const [method, path] of routes) {
      const body = method === 'PATCH' ? {} : undefined
      const { status } = await api(path, { method, body })
      expect(status, `${method} ${path}`).toBe(401)
    }
  })

  it('filters by status', async () => {
    await published({ title: 'Pub', slug: 'pub' })
    await makePost({ title: 'Dra', slug: 'dra' })
    expect(slugs((await api('/admin/posts?status=draft', { token })).json)).toEqual(['dra'])
    expect(slugs((await api('/admin/posts?status=published', { token })).json)).toEqual(['pub'])
    expect((await api('/admin/posts', { token })).json.data).toHaveLength(2)
    expect((await api('/admin/posts?status=bogus', { token })).status).toBe(400)
  })

  it('filters by search, treating wildcards literally', async () => {
    await makePost({ title: 'Alpha one', slug: 'a' })
    await makePost({ title: '50% off', slug: 'b' })
    await makePost({ title: 'Beta', slug: 'c' })
    expect(slugs((await api('/admin/posts?search=alpha', { token })).json)).toEqual(['a'])
    expect(slugs((await api(`/admin/posts?search=${encodeURIComponent('%')}`, { token })).json)).toEqual(['b'])
  })

  it('filters by categoryId', async () => {
    const c1 = await makeCategory('One')
    const c2 = await makeCategory('Two')
    await makePost({ title: 'A', slug: 'a', categoryId: c1 })
    await makePost({ title: 'B', slug: 'b', categoryId: c2 })
    await makePost({ title: 'C', slug: 'c' })
    expect(slugs((await api(`/admin/posts?categoryId=${c1}`, { token })).json)).toEqual(['a'])
    expect((await api('/admin/posts?categoryId=nope', { token })).json.data).toEqual([])
  })

  it('gets by id and 404s on unknown id', async () => {
    const id = (await makePost({ title: 'A', slug: 'a' })).json.data.id
    const found = await api(`/admin/posts/${id}`, { token })
    expect(found.status).toBe(200)
    expect(found.json.data.id).toBe(id)
    const missing = await api('/admin/posts/missing', { token })
    expect(missing.status).toBe(404)
    expect(missing.json.error.code).toBe('NOT_FOUND')
  })
})

describe('patch', () => {
  it('changes only the fields sent', async () => {
    const categoryId = await makeCategory('News')
    const tagId = await makeTag('T')
    const id = (
      await makePost({
        title: 'A',
        slug: 'a',
        excerpt: 'ex',
        content: { k: 1 },
        categoryId,
        tagIds: [tagId],
        isFeatured: true,
        metaTitle: 'MT',
      })
    ).json.data.id

    const { status, json } = await patch(id, { title: 'B' })
    expect(status).toBe(200)
    expect(json.data).toMatchObject({
      title: 'B',
      slug: 'a',
      excerpt: 'ex',
      content: { k: 1 },
      categoryId,
      isFeatured: true,
      metaTitle: 'MT',
      authorId: USER_ID,
    })
    expect(tagIdsOf(json)).toEqual([tagId])
    expect(json.data.category.id).toBe(categoryId)

    const cleared = await patch(id, { excerpt: null, categoryId: null })
    expect(cleared.json.data).toMatchObject({ title: 'B', excerpt: null, categoryId: null, category: null })
  })

  it('replaces tags with tagIds, clears them with [], keeps them when omitted', async () => {
    const t1 = await makeTag('One')
    const t2 = await makeTag('Two')
    const id = (await makePost({ title: 'A', slug: 'a', tagIds: [t1] })).json.data.id

    expect(tagIdsOf(await patch(id, { title: 'A2' }).then((r) => r.json))).toEqual([t1])
    expect(tagIdsOf(await patch(id, { tagIds: [t2] }).then((r) => r.json))).toEqual([t2])

    const cleared = await patch(id, { tagIds: [] })
    expect(cleared.json.data.tags).toEqual([])
    const fetched = await api(`/admin/posts/${id}`, { token })
    expect(fetched.json.data.tags).toEqual([])
  })

  it('never changes status', async () => {
    const id = (await makePost({ title: 'A', slug: 'a' })).json.data.id
    const draft = await patch(id, { title: 'A2', status: 'published' })
    expect(draft.status).toBe(200)
    expect(draft.json.data.status).toBe('draft')
    expect((await api('/api/posts/a')).status).toBe(404)

    await publish(id)
    const stillPub = await patch(id, { title: 'A3', status: 'draft' })
    expect(stillPub.json.data.status).toBe('published')
    expect((await api('/api/posts/a')).status).toBe(200)
  })

  it('409s on a taken slug, allows its own, 400s on unknown refs, 404s on unknown post', async () => {
    await makePost({ title: 'A', slug: 'a' })
    const b = (await makePost({ title: 'B', slug: 'b' })).json.data.id
    expect((await patch(b, { slug: 'a' })).status).toBe(409)
    expect((await patch(b, { slug: 'b' })).status).toBe(200)
    expect((await patch(b, { categoryId: 'nope' })).status).toBe(400)
    expect((await patch(b, { tagIds: ['nope'] })).status).toBe(400)
    expect((await patch('missing', { title: 'x' })).status).toBe(404)
  })
})

describe('delete', () => {
  it('deletes, then 404s everywhere, and frees the slug', async () => {
    const id = (await makePost({ title: 'A', slug: 'gone' })).json.data.id
    await publish(id)
    const del = await api(`/admin/posts/${id}`, { method: 'DELETE', token })
    expect(del.status).toBe(200)
    expect(del.json.data).toEqual({ id })

    expect((await api(`/admin/posts/${id}`, { token })).status).toBe(404)
    expect((await api('/api/posts/gone')).status).toBe(404)
    expect((await api('/api/posts')).json.data).toEqual([])
    expect((await api('/admin/posts', { token })).json.data).toEqual([])
    expect((await api(`/admin/posts/${id}`, { method: 'DELETE', token })).status).toBe(404)

    const again = await makePost({ title: 'A2', slug: 'gone' })
    expect(again.status).toBe(201)
  })
})

describe('revisions', () => {
  it('adds one revision per publish, newest first, without the snapshot', async () => {
    const id = (await makePost({ title: 'V1', slug: 'v' })).json.data.id
    expect(await revisionsOf(id)).toEqual([])

    await publish(id)
    await sleep(3)
    await patch(id, { title: 'V2' })
    await publish(id)
    await sleep(3)
    await patch(id, { title: 'V3' })
    await publish(id)

    const list = await revisionsOf(id)
    expect(list).toHaveLength(3)
    for (const r of list) {
      expect(Object.keys(r).sort()).toEqual(['createdAt', 'createdBy', 'id'])
      expect(r.createdBy).toBe(USER_ID)
    }
    const times = list.map((r: { createdAt: string }) => Date.parse(r.createdAt))
    expect(times).toEqual([...times].sort((a, b) => b - a))

    // newest first: the last entry holds the first title
    await restore(id, list[2].id)
    expect((await api(`/admin/posts/${id}`, { token })).json.data.title).toBe('V1')
    await restore(id, list[0].id)
    expect((await api(`/admin/posts/${id}`, { token })).json.data.title).toBe('V3')
  })

  it('404s the revision list of an unknown post', async () => {
    expect((await api('/admin/posts/missing/revisions', { token })).status).toBe(404)
  })

  it('keeps exactly 10 revisions after 12 publishes, dropping the oldest', async () => {
    const id = (await makePost({ title: 'T0', slug: 'many' })).json.data.id
    for (let n = 1; n <= 12; n++) {
      await patch(id, { title: `T${n}` })
      await publish(id)
      await sleep(3)
    }
    const list = await revisionsOf(id)
    expect(list).toHaveLength(10)
    // oldest kept is T3 (T1, T2 pruned); newest is T12
    await restore(id, list[9].id)
    expect((await api(`/admin/posts/${id}`, { token })).json.data.title).toBe('T3')
    await restore(id, list[0].id)
    expect((await api(`/admin/posts/${id}`, { token })).json.data.title).toBe('T12')
  })

  it('pruning one post leaves another post revisions alone', async () => {
    const other = (await makePost({ title: 'O', slug: 'other' })).json.data.id
    await publish(other)
    const id = (await makePost({ title: 'T', slug: 'many' })).json.data.id
    for (let n = 0; n < 11; n++) await publish(id)
    expect(await revisionsOf(id)).toHaveLength(10)
    expect(await revisionsOf(other)).toHaveLength(1)
  })

  it('restores title, content and tags from an older revision and leaves status unchanged', async () => {
    const t1 = await makeTag('One')
    const t2 = await makeTag('Two')
    const categoryId = await makeCategory('Cat')
    const id = (
      await makePost({ title: 'Old', slug: 'r', content: { v: 1 }, tagIds: [t1], categoryId, excerpt: 'old ex' })
    ).json.data.id
    await publish(id)
    const [oldRev] = await revisionsOf(id)
    await sleep(3)

    await patch(id, { title: 'New', content: { v: 2 }, tagIds: [t2], categoryId: null, excerpt: 'new ex' })
    await publish(id)
    await unpublish(id)

    const res = await restore(id, oldRev.id)
    expect(res.status).toBe(200)
    expect(res.json.data).toMatchObject({
      title: 'Old',
      slug: 'r',
      content: { v: 1 },
      excerpt: 'old ex',
      categoryId,
      status: 'draft',
    })
    expect(tagIdsOf(res.json)).toEqual([t1])
    expect(res.json.data.category.id).toBe(categoryId)

    // restore on a published post keeps it published
    await publish(id)
    const revs = await revisionsOf(id)
    const res2 = await restore(id, revs[revs.length - 1].id)
    expect(res2.json.data.status).toBe('published')
  })

  it('does not add a revision when restoring', async () => {
    const id = (await makePost({ title: 'A', slug: 'a' })).json.data.id
    await publish(id)
    const [rev] = await revisionsOf(id)
    await restore(id, rev.id)
    expect(await revisionsOf(id)).toHaveLength(1)
  })

  it('404s an unknown revision', async () => {
    const id = (await makePost({ title: 'A', slug: 'a' })).json.data.id
    const { status, json } = await restore(id, 'missing')
    expect(status).toBe(404)
    expect(json.error.code).toBe('NOT_FOUND')
    expect((await restore('missing', 'missing')).status).toBe(404)
  })

  it('409s when the snapshot slug is now used by another post', async () => {
    const id = (await makePost({ title: 'A', slug: 'old-slug' })).json.data.id
    await publish(id)
    const [rev] = await revisionsOf(id)
    await patch(id, { slug: 'new-slug' })
    await makePost({ title: 'Squatter', slug: 'old-slug' })

    const { status, json } = await restore(id, rev.id)
    expect(status).toBe(409)
    expect(json.error.code).toBe('CONFLICT')
    expect((await api(`/admin/posts/${id}`, { token })).json.data.slug).toBe('new-slug')
  })

  it('restores a slug that is still free, even if it differs from the current one', async () => {
    const id = (await makePost({ title: 'A', slug: 'old-slug' })).json.data.id
    await publish(id)
    const [rev] = await revisionsOf(id)
    await patch(id, { slug: 'new-slug' })
    const { status, json } = await restore(id, rev.id)
    expect(status).toBe(200)
    expect(json.data.slug).toBe('old-slug')
  })

  it('cannot restore a revision of post A onto post B', async () => {
    const a = (await makePost({ title: 'A', slug: 'a' })).json.data.id
    const b = (await makePost({ title: 'B', slug: 'b' })).json.data.id
    await publish(a)
    const [rev] = await revisionsOf(a)
    const { status, json } = await restore(b, rev.id)
    expect(status).toBe(404)
    expect(json.error.code).toBe('NOT_FOUND')
    expect((await api(`/admin/posts/${b}`, { token })).json.data.title).toBe('B')
  })

  it('drops tags and category deleted since the snapshot instead of failing', async () => {
    const tagId = await makeTag('Gone')
    const categoryId = await makeCategory('GoneCat')
    const id = (await makePost({ title: 'A', slug: 'a', tagIds: [tagId], categoryId })).json.data.id
    await publish(id)
    const [rev] = await revisionsOf(id)
    await api(`/admin/tags/${tagId}`, { method: 'DELETE', token })
    await api(`/admin/categories/${categoryId}`, { method: 'DELETE', token })
    const { status, json } = await restore(id, rev.id)
    expect(status).toBe(200)
    expect(json.data.tags).toEqual([])
    expect(json.data.category).toBeNull()
    expect(json.data.categoryId).toBeNull()
  })
})

describe('soft-deleted tags and categories', () => {
  it('no longer show on posts after the tag is deleted', async () => {
    const keep = await makeTag('Keep', 'keep')
    const drop = await makeTag('Drop', 'drop')
    const id = await published({ title: 'A', slug: 'a', tagIds: [keep, drop] })
    await api(`/admin/tags/${drop}`, { method: 'DELETE', token })

    expect(tagIdsOf((await api(`/admin/posts/${id}`, { token })).json)).toEqual([keep])
    expect(tagIdsOf((await api('/api/posts/a')).json)).toEqual([keep])
    const list = await api('/api/posts')
    expect(list.json.data[0].tags.map((t: { id: string }) => t.id)).toEqual([keep])
    expect((await api('/api/posts?tag=drop')).json.data).toEqual([])
  })

  it('no longer show on posts after the category is deleted', async () => {
    const categoryId = await makeCategory('Cat', 'cat')
    const id = await published({ title: 'A', slug: 'a', categoryId })
    await api(`/admin/categories/${categoryId}`, { method: 'DELETE', token })

    expect((await api(`/admin/posts/${id}`, { token })).json.data.category).toBeNull()
    expect((await api('/api/posts/a')).json.data.category).toBeNull()
    expect((await api('/api/posts')).json.data[0].category).toBeNull()
    expect((await api('/api/posts?category=cat')).json.data).toEqual([])
  })

  it('cannot attach a deleted tag or category to a new post', async () => {
    const tagId = await makeTag('Gone')
    const categoryId = await makeCategory('GoneCat')
    await api(`/admin/tags/${tagId}`, { method: 'DELETE', token })
    await api(`/admin/categories/${categoryId}`, { method: 'DELETE', token })
    expect((await makePost({ title: 'A', slug: 'a', tagIds: [tagId] })).status).toBe(400)
    expect((await makePost({ title: 'A', slug: 'a', categoryId })).status).toBe(400)
  })
})
