import type { Row } from '../resource'

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: unknown

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }

  /** Validation problems by field name, from the zod issues the API sends in `error.details`. */
  get fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {}
    if (!Array.isArray(this.details)) return out
    for (const issue of this.details as Array<{ path?: unknown[]; message?: string }>) {
      const key = issue.path?.[0]
      if (typeof key === 'string' && issue.message && !(key in out)) out[key] = issue.message
    }
    return out
  }
}

export type Pagination = { total: number; page: number; limit: number; totalPages: number; hasMore: boolean }
export type Page<T> = { data: T[]; pagination: Pagination }
export type Query = Record<string, string | number | boolean | undefined | null>

export type User = {
  id: string
  email: string
  fullName: string
  role: 'admin' | 'editor'
  isActive: boolean
}

export type Media = {
  id: string
  fileName: string
  key: string
  contentType: string
  size: number
  alt: string | null
  width: number | null
  height: number | null
  url: string
  createdAt: string
}

type Tokens = { accessToken: string; refreshToken: string }

export type ApiClient = ReturnType<typeof createApiClient>

export type ApiClientOptions = {
  /** Base URL of the Kiln API. Empty means the same origin as the page. */
  baseUrl?: string
  /** localStorage key that holds the tokens. */
  storageKey?: string
  /** Called when the session cannot be refreshed any more. */
  onSignedOut?: () => void
}

export function createApiClient({ baseUrl = '', storageKey = 'kiln-admin', onSignedOut }: ApiClientOptions = {}) {
  const base = baseUrl.replace(/\/+$/, '')

  // localStorage can throw (private windows, blocked storage): fall back to memory.
  let memory: Tokens | null = null
  const readTokens = (): Tokens | null => {
    try {
      const raw = localStorage.getItem(storageKey)
      return raw ? (JSON.parse(raw) as Tokens) : memory
    } catch {
      return memory
    }
  }
  const writeTokens = (tokens: Tokens | null) => {
    memory = tokens
    try {
      if (tokens) localStorage.setItem(storageKey, JSON.stringify(tokens))
      else localStorage.removeItem(storageKey)
    } catch {
      // keep the memory copy
    }
  }

  const url = (path: string, query?: Query) => {
    const search = new URLSearchParams()
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== null && value !== '') search.set(key, String(value))
    }
    const qs = search.toString()
    return `${base}${path}${qs ? `?${qs}` : ''}`
  }

  async function parse(res: Response): Promise<{ data: unknown; pagination?: Pagination }> {
    let body: {
      success?: boolean
      data?: unknown
      pagination?: Pagination
      error?: { code?: string; message?: string; details?: unknown }
    } | null = null
    try {
      body = await res.json()
    } catch {
      // not JSON
    }
    if (!res.ok || body?.success === false) {
      const error = body?.error
      throw new ApiError(
        res.status,
        error?.code ?? 'HTTP_ERROR',
        error?.message ?? `Request failed (${res.status})`,
        error?.details,
      )
    }
    return { data: body?.data, pagination: body?.pagination }
  }

  // One refresh at a time: the refresh token is single-use.
  let refreshing: Promise<boolean> | null = null
  function refresh(): Promise<boolean> {
    refreshing ??= (async () => {
      const tokens = readTokens()
      if (!tokens) return false
      try {
        const res = await fetch(url('/auth/refresh'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: tokens.refreshToken }),
        })
        const { data } = await parse(res)
        const next = data as Tokens
        writeTokens({ accessToken: next.accessToken, refreshToken: next.refreshToken })
        return true
      } catch {
        writeTokens(null)
        return false
      }
    })().finally(() => {
      refreshing = null
    })
    return refreshing
  }

  async function request(
    method: string,
    path: string,
    options: { query?: Query; json?: unknown; form?: FormData; auth?: boolean } = {},
  ) {
    const send = () => {
      const headers: Record<string, string> = {}
      const tokens = readTokens()
      if (options.auth !== false && tokens) headers.Authorization = `Bearer ${tokens.accessToken}`
      let body: BodyInit | undefined
      if (options.form) body = options.form
      else if (options.json !== undefined) {
        headers['Content-Type'] = 'application/json'
        body = JSON.stringify(options.json)
      }
      return fetch(url(path, options.query), { method: method.toUpperCase(), headers, body })
    }

    let res = await send()
    if (res.status === 401 && options.auth !== false && readTokens()) {
      if (await refresh()) res = await send()
      else {
        onSignedOut?.()
      }
    }
    return parse(res)
  }

  return {
    baseUrl: base,
    hasSession: () => readTokens() !== null,

    async login(email: string, password: string) {
      const { data } = await request('post', '/auth/login', { json: { email, password }, auth: false })
      const result = data as Tokens & { user: User }
      writeTokens({ accessToken: result.accessToken, refreshToken: result.refreshToken })
      return result.user
    },

    /** Create the first admin. The API allows this only while there are no users. */
    async setup(input: { email: string; password: string; fullName: string }) {
      await request('post', '/auth/setup', { json: input, auth: false })
      return this.login(input.email, input.password)
    },

    async logout() {
      const tokens = readTokens()
      writeTokens(null)
      if (tokens) {
        await fetch(url('/auth/logout'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: tokens.refreshToken }),
        }).catch(() => undefined)
      }
    },

    async me() {
      const { data } = await request('get', '/auth/me')
      return data as User
    },

    async list<T = Row>(path: string, query?: Query): Promise<Page<T>> {
      const { data, pagination } = await request('get', path, { query })
      return {
        data: data as T[],
        pagination: pagination ?? { total: (data as T[]).length, page: 1, limit: 0, totalPages: 1, hasMore: false },
      }
    },

    async get<T = Row>(path: string, query?: Query) {
      const { data } = await request('get', path, { query })
      return data as T
    },

    async post<T = Row>(path: string, json?: unknown) {
      const { data } = await request('post', path, { json: json ?? {} })
      return data as T
    },

    async patch<T = Row>(path: string, json: unknown) {
      const { data } = await request('patch', path, { json })
      return data as T
    },

    async remove(path: string) {
      await request('delete', path)
    },

    async upload(file: File, extra: { alt?: string; width?: number; height?: number } = {}) {
      const form = new FormData()
      form.set('file', file)
      if (extra.alt) form.set('alt', extra.alt)
      if (extra.width) form.set('width', String(extra.width))
      if (extra.height) form.set('height', String(extra.height))
      const { data } = await request('post', '/admin/media', { form })
      return data as Media
    },
  }
}
