import { beforeEach, describe, expect, it } from 'vitest'
import { api, execute, resetDb } from './helpers'

const ADMIN = { email: 'Admin@Example.com', password: 'correct-horse-1', fullName: 'Ada Admin' }

beforeEach(resetDb)

const setup = (body: Record<string, unknown> = ADMIN) => api('/auth/setup', { body })
const login = (email: string, password: string) => api('/auth/login', { body: { email, password } })

describe('setup', () => {
  it('creates the first admin with 201, tokens and no passwordHash', async () => {
    const { status, json } = await setup()
    expect(status).toBe(201)
    expect(json.success).toBe(true)
    expect(typeof json.data.accessToken).toBe('string')
    expect(typeof json.data.refreshToken).toBe('string')
    expect(json.data.user).toMatchObject({
      email: 'admin@example.com',
      fullName: 'Ada Admin',
      role: 'admin',
      isActive: true,
    })
    expect(json.data.user.passwordHash).toBeUndefined()
    expect(json.data.user).not.toHaveProperty('passwordHash')
  })

  it('rejects a second setup with 403', async () => {
    await setup()
    const { status, json } = await setup({ ...ADMIN, email: 'other@example.com' })
    expect(status).toBe(403)
    expect(json).toMatchObject({ success: false, error: { code: 'FORBIDDEN' } })
  })

  it('rejects a short password with 400 VALIDATION_ERROR', async () => {
    const { status, json } = await setup({ ...ADMIN, password: 'short' })
    expect(status).toBe(400)
    expect(json.success).toBe(false)
    expect(json.error.code).toBe('VALIDATION_ERROR')
  })
})

describe('login', () => {
  it('signs in with the right password, matching email case-insensitively', async () => {
    await setup()
    const { status, json } = await login('ADMIN@example.COM', ADMIN.password)
    expect(status).toBe(200)
    expect(json.data.user.email).toBe('admin@example.com')
    expect(json.data.user.passwordHash).toBeUndefined()
    expect(typeof json.data.accessToken).toBe('string')
    expect(typeof json.data.refreshToken).toBe('string')
  })

  it('returns INVALID_CREDENTIALS for a wrong password', async () => {
    await setup()
    const { status, json } = await login(ADMIN.email, 'wrong-password')
    expect(status).toBe(401)
    expect(json).toMatchObject({ success: false, error: { code: 'INVALID_CREDENTIALS' } })
  })

  it('returns INVALID_CREDENTIALS for an unknown email', async () => {
    await setup()
    const { status, json } = await login('nobody@example.com', ADMIN.password)
    expect(status).toBe(401)
    expect(json.error.code).toBe('INVALID_CREDENTIALS')
  })
})

describe('access token', () => {
  it('works on GET /auth/me and on an admin route', async () => {
    const { json: setupJson } = await setup()
    const token = setupJson.data.accessToken

    const me = await api('/auth/me', { token })
    expect(me.status).toBe(200)
    expect(me.json.data).toMatchObject({ email: 'admin@example.com', role: 'admin' })
    expect(me.json.data.passwordHash).toBeUndefined()

    const admin = await api('/admin/categories', { token })
    expect(admin.status).toBe(200)
    expect(admin.json.success).toBe(true)
  })

  it('GET /auth/me without a token is 401', async () => {
    const { status, json } = await api('/auth/me')
    expect(status).toBe(401)
    expect(json.success).toBe(false)
    expect(json.error.code).toBe('UNAUTHORIZED')
  })
})

describe('refresh', () => {
  it('returns new tokens, and the new refresh token works while the old one is rejected', async () => {
    const { json: setupJson } = await setup()
    const oldRefresh = setupJson.data.refreshToken

    const first = await api('/auth/refresh', { body: { refreshToken: oldRefresh } })
    expect(first.status).toBe(200)
    expect(typeof first.json.data.accessToken).toBe('string')
    expect(typeof first.json.data.refreshToken).toBe('string')
    expect(first.json.data.refreshToken).not.toBe(oldRefresh)

    const newAccess = await api('/auth/me', { token: first.json.data.accessToken })
    expect(newAccess.status).toBe(200)

    const second = await api('/auth/refresh', { body: { refreshToken: first.json.data.refreshToken } })
    expect(second.status).toBe(200)

    const replayed = await api('/auth/refresh', { body: { refreshToken: oldRefresh } })
    expect(replayed.status).toBe(401)
    expect(replayed.json.error.code).toBe('INVALID_TOKEN')
  })

  it('logout makes the refresh token unusable', async () => {
    const { json: setupJson } = await setup()
    const { refreshToken } = setupJson.data

    const out = await api('/auth/logout', { body: { refreshToken } })
    expect(out.status).toBe(200)
    expect(out.json.data).toEqual({ loggedOut: true })

    const refreshed = await api('/auth/refresh', { body: { refreshToken } })
    expect(refreshed.status).toBe(401)
    expect(refreshed.json.error.code).toBe('INVALID_TOKEN')
  })
})

describe('deactivated users', () => {
  it('cannot log in or refresh once deactivated', async () => {
    const { json: setupJson } = await setup()
    const adminToken = setupJson.data.accessToken

    const created = await api('/admin/users', {
      body: { email: 'writer@example.com', password: 'writer-pass-1', fullName: 'Wendy Writer', role: 'editor' },
      token: adminToken,
    })
    expect(created.status).toBe(201)
    const userId = created.json.data.id

    const before = await login('writer@example.com', 'writer-pass-1')
    expect(before.status).toBe(200)
    const refreshToken = before.json.data.refreshToken

    const deactivated = await api(`/admin/users/${userId}`, {
      method: 'PATCH',
      body: { isActive: false },
      token: adminToken,
    })
    expect(deactivated.status).toBe(200)

    const relogin = await login('writer@example.com', 'writer-pass-1')
    expect(relogin.status).toBe(403)
    expect(relogin.json.error.code).toBe('FORBIDDEN')

    const refreshed = await api('/auth/refresh', { body: { refreshToken } })
    expect(refreshed.status).toBe(401)
    expect(refreshed.json.error.code).toBe('INVALID_TOKEN')
  })
})

describe('change password', () => {
  const NEW_PASSWORD = 'brand-new-pass-2'
  const change = (token: string | undefined, body: Record<string, unknown>) => api('/auth/password', { body, token })

  it('sets the new password, ends old sessions and returns working tokens', async () => {
    const { json: setupJson } = await setup()
    const { accessToken, refreshToken: oldRefresh } = setupJson.data

    const changed = await change(accessToken, { currentPassword: ADMIN.password, newPassword: NEW_PASSWORD })
    expect(changed.status).toBe(200)
    expect(typeof changed.json.data.accessToken).toBe('string')
    expect(changed.json.data.refreshToken).not.toBe(oldRefresh)

    const oldSession = await api('/auth/refresh', { body: { refreshToken: oldRefresh } })
    expect(oldSession.status).toBe(401)
    const newSession = await api('/auth/refresh', { body: { refreshToken: changed.json.data.refreshToken } })
    expect(newSession.status).toBe(200)

    expect((await login(ADMIN.email, ADMIN.password)).status).toBe(401)
    expect((await login(ADMIN.email, NEW_PASSWORD)).status).toBe(200)
  })

  it('rejects a wrong current password with 400 and keeps the old one', async () => {
    const { json: setupJson } = await setup()
    const { status, json } = await change(setupJson.data.accessToken, {
      currentPassword: 'wrong-password',
      newPassword: NEW_PASSWORD,
    })
    expect(status).toBe(400)
    expect(json.error.code).toBe('BAD_REQUEST')
    expect((await login(ADMIN.email, ADMIN.password)).status).toBe(200)
  })

  it('rejects a short new password with 400 VALIDATION_ERROR', async () => {
    const { json: setupJson } = await setup()
    const { status, json } = await change(setupJson.data.accessToken, {
      currentPassword: ADMIN.password,
      newPassword: 'short',
    })
    expect(status).toBe(400)
    expect(json.error.code).toBe('VALIDATION_ERROR')
  })

  it('is 401 without a token', async () => {
    const { status } = await change(undefined, { currentPassword: ADMIN.password, newPassword: NEW_PASSWORD })
    expect(status).toBe(401)
  })
})

describe('rate limit', () => {
  const loginFrom = (ip: string, password: string) =>
    api('/auth/login', { body: { email: ADMIN.email, password }, headers: { 'CF-Connecting-IP': ip } })

  it('answers 429 with Retry-After after 10 attempts from one IP, even with the right password', async () => {
    await setup()
    for (let i = 0; i < 10; i++) expect((await loginFrom('203.0.113.1', 'wrong-password')).status).toBe(401)

    const blocked = await loginFrom('203.0.113.1', ADMIN.password)
    expect(blocked.status).toBe(429)
    expect(blocked.json).toMatchObject({ success: false, error: { code: 'TOO_MANY_REQUESTS' } })
    const retryAfter = Number(blocked.res.headers.get('Retry-After'))
    expect(retryAfter).toBeGreaterThan(0)
    expect(retryAfter).toBeLessThanOrEqual(15 * 60)
    expect(blocked.json.error.details.retryAfterSeconds).toBe(retryAfter)
  })

  it('counts each IP separately', async () => {
    await setup()
    for (let i = 0; i < 11; i++) await loginFrom('203.0.113.1', 'wrong-password')
    expect((await loginFrom('203.0.113.1', ADMIN.password)).status).toBe(429)
    expect((await loginFrom('203.0.113.2', ADMIN.password)).status).toBe(200)
  })

  it('starts a new window once the old one has ended', async () => {
    await setup()
    for (let i = 0; i < 11; i++) await loginFrom('203.0.113.1', 'wrong-password')
    expect((await loginFrom('203.0.113.1', ADMIN.password)).status).toBe(429)

    await execute('UPDATE rate_limits SET window_started_at = ?', [Date.now() - 16 * 60 * 1000])
    expect((await loginFrom('203.0.113.1', ADMIN.password)).status).toBe(200)
  })
})
