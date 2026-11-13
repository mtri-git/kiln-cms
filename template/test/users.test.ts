import { beforeEach, describe, expect, it } from 'vitest'
import { api, resetDb, tokenFor } from './helpers'

const ADMIN = { email: 'boss@example.com', password: 'admin-pass-1', fullName: 'Boss Admin' }

let adminId: string
let token: string

beforeEach(async () => {
  await resetDb()
  const setup = await api('/auth/setup', { body: ADMIN })
  adminId = setup.json.data.user.id
  token = setup.json.data.accessToken
})

const createUser = (body: Record<string, unknown>, auth = token) => api('/admin/users', { body, token: auth })
const login = (email: string, password: string) => api('/auth/login', { body: { email, password } })

describe('list users', () => {
  it('returns pagination meta', async () => {
    for (const n of [1, 2, 3]) {
      await createUser({ email: `u${n}@example.com`, password: 'password-1', fullName: `User ${n}`, role: 'editor' })
    }
    const { status, json } = await api('/admin/users?limit=2&page=1', { token })
    expect(status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data).toHaveLength(2)
    expect(json.pagination).toEqual({ total: 4, page: 1, limit: 2, totalPages: 2, hasMore: true })
    for (const user of json.data) expect(user.passwordHash).toBeUndefined()
  })

  it('filters by search, role and isActive', async () => {
    await createUser({ email: 'alice@example.com', password: 'password-1', fullName: 'Alice Smith', role: 'editor' })
    await createUser({ email: 'bob@example.com', password: 'password-1', fullName: 'Bob Jones', role: 'editor' })
    const carol = (
      await createUser({ email: 'carol@example.com', password: 'password-1', fullName: 'Carol Smith', role: 'admin' })
    ).json.data
    await api(`/admin/users/${carol.id}`, { method: 'PATCH', body: { isActive: false }, token })

    const bySearch = await api('/admin/users?search=smith', { token })
    expect(bySearch.json.data.map((u: { email: string }) => u.email).sort()).toEqual([
      'alice@example.com',
      'carol@example.com',
    ])

    const byEmail = await api('/admin/users?search=bob@', { token })
    expect(byEmail.json.data.map((u: { email: string }) => u.email)).toEqual(['bob@example.com'])

    // % and _ match themselves, not any text.
    expect((await api(`/admin/users?search=${encodeURIComponent('%')}`, { token })).json.data).toEqual([])
    expect((await api('/admin/users?search=_', { token })).json.data).toEqual([])

    const editors = await api('/admin/users?role=editor', { token })
    expect(editors.json.pagination.total).toBe(2)
    expect(editors.json.data.every((u: { role: string }) => u.role === 'editor')).toBe(true)

    const inactive = await api('/admin/users?isActive=false', { token })
    expect(inactive.json.data.map((u: { email: string }) => u.email)).toEqual(['carol@example.com'])

    const active = await api('/admin/users?isActive=true', { token })
    expect(active.json.pagination.total).toBe(3)
  })
})

describe('create user', () => {
  it('creates with 201 and no passwordHash, and the new user can log in', async () => {
    const { status, json } = await createUser({
      email: 'New.Editor@Example.com',
      password: 'editor-pass-1',
      fullName: 'New Editor',
      role: 'editor',
    })
    expect(status).toBe(201)
    expect(json.success).toBe(true)
    expect(json.data).toMatchObject({
      email: 'new.editor@example.com',
      fullName: 'New Editor',
      role: 'editor',
      isActive: true,
    })
    expect(json.data.passwordHash).toBeUndefined()

    const signin = await login('new.editor@example.com', 'editor-pass-1')
    expect(signin.status).toBe(200)
    expect(signin.json.data.user.id).toBe(json.data.id)
  })

  it('rejects a duplicate email with 409', async () => {
    await createUser({ email: 'dup@example.com', password: 'password-1', fullName: 'Dup', role: 'editor' })
    const { status, json } = await createUser({
      email: 'DUP@example.com',
      password: 'password-1',
      fullName: 'Dup 2',
      role: 'editor',
    })
    expect(status).toBe(409)
    expect(json).toMatchObject({ success: false, error: { code: 'CONFLICT' } })
  })

  it('rejects a short password with 400', async () => {
    const { status, json } = await createUser({
      email: 'short@example.com',
      password: 'short',
      fullName: 'Short',
      role: 'editor',
    })
    expect(status).toBe(400)
    expect(json.error.code).toBe('VALIDATION_ERROR')
  })
})

describe('get user', () => {
  it('gets by id and 404s on an unknown id', async () => {
    const id = (
      await createUser({ email: 'get@example.com', password: 'password-1', fullName: 'Get Me', role: 'editor' })
    ).json.data.id
    const found = await api(`/admin/users/${id}`, { token })
    expect(found.status).toBe(200)
    expect(found.json.data).toMatchObject({ id, email: 'get@example.com' })
    expect(found.json.data.passwordHash).toBeUndefined()

    const missing = await api('/admin/users/missing', { token })
    expect(missing.status).toBe(404)
    expect(missing.json).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } })
  })
})

describe('update user', () => {
  it('patches fullName and role', async () => {
    const id = (
      await createUser({ email: 'patch@example.com', password: 'password-1', fullName: 'Old Name', role: 'editor' })
    ).json.data.id
    const { status, json } = await api(`/admin/users/${id}`, {
      method: 'PATCH',
      body: { fullName: 'New Name', role: 'admin' },
      token,
    })
    expect(status).toBe(200)
    expect(json.data).toMatchObject({ id, email: 'patch@example.com', fullName: 'New Name', role: 'admin' })
    expect(json.data.passwordHash).toBeUndefined()
  })

  it('a new password works and the old one stops working', async () => {
    const id = (
      await createUser({ email: 'pw@example.com', password: 'old-password-1', fullName: 'PW', role: 'editor' })
    ).json.data.id
    const patched = await api(`/admin/users/${id}`, { method: 'PATCH', body: { password: 'new-password-1' }, token })
    expect(patched.status).toBe(200)

    expect((await login('pw@example.com', 'new-password-1')).status).toBe(200)
    const old = await login('pw@example.com', 'old-password-1')
    expect(old.status).toBe(401)
    expect(old.json.error.code).toBe('INVALID_CREDENTIALS')
  })
})

describe('editor access', () => {
  it('gets 403 on every users route', async () => {
    const editor = await tokenFor('editor')
    const id = (
      await createUser({ email: 'target@example.com', password: 'password-1', fullName: 'Target', role: 'editor' })
    ).json.data.id
    const routes: [string, string, Record<string, unknown> | undefined][] = [
      ['GET', '/admin/users', undefined],
      ['GET', `/admin/users/${id}`, undefined],
      ['POST', '/admin/users', { email: 'x@example.com', password: 'password-1', fullName: 'X', role: 'editor' }],
      ['PATCH', `/admin/users/${id}`, { fullName: 'Hacked' }],
      ['DELETE', `/admin/users/${id}`, undefined],
    ]
    for (const [method, path, body] of routes) {
      const { status, json } = await api(path, { method, body, token: editor })
      expect(status, `${method} ${path}`).toBe(403)
      expect(json.error.code).toBe('FORBIDDEN')
    }
  })

  it('gets 401 without a token', async () => {
    const routes: [string, string, Record<string, unknown> | undefined][] = [
      ['GET', '/admin/users', undefined],
      ['GET', `/admin/users/${adminId}`, undefined],
      ['POST', '/admin/users', { email: 'y@example.com', password: 'password-1', fullName: 'Y', role: 'editor' }],
      ['PATCH', `/admin/users/${adminId}`, { fullName: 'Nope' }],
      ['DELETE', `/admin/users/${adminId}`, undefined],
    ]
    for (const [method, path, body] of routes) {
      const { status, json } = await api(path, { method, body })
      expect(status, `${method} ${path}`).toBe(401)
      expect(json.error.code).toBe('UNAUTHORIZED')
    }
  })
})

describe('self-protection', () => {
  it('an admin cannot delete themselves', async () => {
    const { status, json } = await api(`/admin/users/${adminId}`, { method: 'DELETE', token })
    expect(status).toBe(400)
    expect(json.error.code).toBe('BAD_REQUEST')
    expect((await api(`/admin/users/${adminId}`, { token })).status).toBe(200)
  })

  it('an admin cannot deactivate themselves', async () => {
    const { status, json } = await api(`/admin/users/${adminId}`, {
      method: 'PATCH',
      body: { isActive: false },
      token,
    })
    expect(status).toBe(400)
    expect(json.error.code).toBe('BAD_REQUEST')
  })

  it('an admin cannot remove their own admin role', async () => {
    const { status, json } = await api(`/admin/users/${adminId}`, {
      method: 'PATCH',
      body: { role: 'editor' },
      token,
    })
    expect(status).toBe(400)
    expect(json.error.code).toBe('BAD_REQUEST')
  })
})

describe('delete user', () => {
  it('404s afterwards, blocks login, and frees the email for reuse', async () => {
    const id = (
      await createUser({ email: 'gone@example.com', password: 'password-1', fullName: 'Gone', role: 'editor' })
    ).json.data.id

    const del = await api(`/admin/users/${id}`, { method: 'DELETE', token })
    expect(del.status).toBe(200)
    expect(del.json.data).toEqual({ id })

    expect((await api(`/admin/users/${id}`, { token })).status).toBe(404)
    expect((await api(`/admin/users/${id}`, { method: 'PATCH', body: { fullName: 'x' }, token })).status).toBe(404)
    expect((await api(`/admin/users/${id}`, { method: 'DELETE', token })).status).toBe(404)

    const blocked = await login('gone@example.com', 'password-1')
    expect(blocked.status).toBe(401)
    expect(blocked.json.error.code).toBe('INVALID_CREDENTIALS')

    const reused = await createUser({
      email: 'gone@example.com',
      password: 'fresh-pass-1',
      fullName: 'Reborn',
      role: 'editor',
    })
    expect(reused.status).toBe(201)
    expect(reused.json.data.id).not.toBe(id)
    expect((await login('gone@example.com', 'fresh-pass-1')).status).toBe(200)
  })
})
