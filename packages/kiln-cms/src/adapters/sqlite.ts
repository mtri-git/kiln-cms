// Shared by kiln-cms/node and kiln-cms/bun: a SQLite file through libSQL for data, a folder for files.
import { createReadStream, existsSync } from 'node:fs'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import { Readable } from 'node:stream'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import type { KilnOptions } from '../app'
import type { DbClient } from '../core/request-context'
import type { FileStorage } from '../core/storage'
import { logger } from '../core/utils/logger'
import { createHandler } from '../handler'

export type ServerConfig = {
  /** Default: `PORT`, then 8787. */
  port?: number
  /** Default: `HOST`, then every interface. (Not `HOSTNAME`: containers set it to their own name.) */
  hostname?: string
  /** libSQL URL of the database. Default: `DATABASE_URL`, then `file:./data/kiln.db`. */
  databaseUrl?: string
  /** Auth token, for a remote libSQL server (Turso). Default: `DATABASE_AUTH_TOKEN`. */
  databaseAuthToken?: string
  /** Folder of the uploaded files. Default: `FILES_DIR`, then `./data/files`. */
  filesDir?: string
  /** Migrations applied at startup. `false` skips them. Default: `./migrations`. */
  migrationsFolder?: string | false
  /**
   * Header that holds the client IP when the server runs behind one proxy (`X-Forwarded-For`, `X-Real-IP`,
   * `CF-Connecting-IP`). Default: `CLIENT_IP_HEADER`, then none: the IP of the socket. For a list, the last
   * entry is used: the one the proxy appended, which the client cannot forge. Only set it behind a proxy.
   */
  clientIpHeader?: string
  /** Vars and secrets that `getEnv()` returns. Default: `process.env`. */
  env?: Record<string, string | undefined>
}

export type SqliteRuntimeConfig = {
  databaseUrl: string
  databaseAuthToken?: string
  filesDir: string
  migrationsFolder?: string | false
}

export type SqliteRuntime = {
  db: DbClient
  storage: FileStorage
  /** Runs one SQL statement on the database, outside Drizzle (scripts, tests). */
  execute: (sql: string, args?: (string | number | null)[]) => Promise<{ rows: Record<string, unknown>[] }>
  close: () => void
}

/** Opens the database (creating its folder), applies the migrations and prepares the files folder. */
export async function createSqliteRuntime(config: SqliteRuntimeConfig): Promise<SqliteRuntime> {
  const { databaseUrl } = config
  if (databaseUrl.startsWith('file:')) {
    const path = databaseUrl.slice('file:'.length).split('?')[0]
    if (path && path !== ':memory:') await mkdir(dirname(resolve(path)), { recursive: true })
  }
  // `timeout` is the busy timeout of every connection in the client's pool (a PRAGMA would reach only one).
  const client = createClient({ url: databaseUrl, authToken: config.databaseAuthToken, timeout: 5000 })
  // WAL lets reads run while a write is in progress. It is stored in the file, so one connection is enough.
  if (databaseUrl.startsWith('file:')) await client.execute('PRAGMA journal_mode = WAL')

  const db = drizzle(client)
  if (config.migrationsFolder !== false) {
    await migrate(db, { migrationsFolder: config.migrationsFolder ?? './migrations' })
  }
  return {
    db,
    storage: fsStorage(config.filesDir),
    execute: async (sql, args = []) => {
      const result = await client.execute({ sql, args })
      return { rows: result.rows as unknown as Record<string, unknown>[] }
    },
    close: () => client.close(),
  }
}

/**
 * Files in a folder: `<dir>/<key>`, with the content type in `<dir>/.meta/<key>.json`.
 * Keys with an empty segment or a segment that starts with a dot are refused, so a key never leaves `dir`.
 */
export function fsStorage(dir: string): FileStorage {
  const root = resolve(dir)
  const pathOf = (key: string, meta = false): string => {
    const segments = key.split('/')
    if (segments.some((segment) => !segment || segment.startsWith('.') || segment.includes('\\'))) {
      throw new Error(`Invalid file key: ${key}`)
    }
    const path = meta ? join(root, '.meta', `${key}.json`) : join(root, key)
    if (!path.startsWith(root + sep)) throw new Error(`Invalid file key: ${key}`)
    return path
  }

  return {
    async put(key, data, { contentType }) {
      const path = pathOf(key)
      const metaPath = pathOf(key, true)
      await mkdir(dirname(path), { recursive: true })
      await mkdir(dirname(metaPath), { recursive: true })
      await writeFile(path, data instanceof Uint8Array ? data : new Uint8Array(data))
      await writeFile(metaPath, JSON.stringify({ contentType }))
    },
    async get(key) {
      let path: string
      try {
        path = pathOf(key)
      } catch {
        return null
      }
      const info = await stat(path).catch(() => null)
      if (!info?.isFile()) return null
      const contentType = await readFile(pathOf(key, true), 'utf8')
        .then((text) => (JSON.parse(text) as { contentType?: string }).contentType)
        .catch(() => undefined)
      return {
        // Node types its web streams apart from the global ReadableStream; at runtime they are the same class.
        body: Readable.toWeb(createReadStream(path)) as unknown as ReadableStream<Uint8Array>,
        contentType: contentType ?? 'application/octet-stream',
        size: info.size,
        etag: `"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`,
      }
    },
    async delete(key) {
      await rm(pathOf(key), { force: true })
      await rm(pathOf(key, true), { force: true })
    },
  }
}

export type ResolvedServer = {
  port: number
  hostname?: string
  clientIpHeader?: string
  env: Record<string, string | undefined>
  runtime: SqliteRuntime
  handle: ReturnType<typeof createHandler>
  /** Waits for the change hooks still running. */
  drain: () => Promise<void>
  waitUntil: (promise: Promise<unknown>) => void
}

/** Reads the config (options first, then env vars, then defaults) and opens the runtime. Used by both servers. */
export async function prepareServer(options: KilnOptions, config: ServerConfig): Promise<ResolvedServer> {
  if (!config.env && existsSync('.env') && typeof process.loadEnvFile === 'function') process.loadEnvFile('.env')
  const env = config.env ?? process.env
  // Unset means production: internal error messages stay hidden unless .env says development.
  env.NODE_ENV ??= 'production'
  if (options.builtInAuth !== false && !env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not set: put it in .env (32 characters or more, random)')
  }

  const runtime = await createSqliteRuntime({
    databaseUrl: config.databaseUrl ?? env.DATABASE_URL ?? 'file:./data/kiln.db',
    databaseAuthToken: config.databaseAuthToken ?? env.DATABASE_AUTH_TOKEN,
    filesDir: config.filesDir ?? env.FILES_DIR ?? './data/files',
    migrationsFolder: config.migrationsFolder,
  })

  const pending = new Set<Promise<unknown>>()
  const waitUntil = (promise: Promise<unknown>) => {
    const tracked = promise.catch(() => {}).finally(() => pending.delete(tracked))
    pending.add(tracked)
  }

  return {
    port: config.port ?? (env.PORT ? Number(env.PORT) : 8787),
    hostname: config.hostname ?? env.HOST,
    clientIpHeader: config.clientIpHeader ?? env.CLIENT_IP_HEADER,
    env,
    runtime,
    handle: createHandler(options),
    drain: async () => {
      await Promise.allSettled([...pending])
    },
    waitUntil,
  }
}

/**
 * The client IP from the configured header, or the socket address. For a list (`X-Forwarded-For: a, b`) the last
 * entry wins: a proxy appends the address it saw, so earlier entries can be anything the client sent.
 */
export function clientIpOf(request: Request, header: string | undefined, socketIp: string | undefined) {
  if (header) {
    const value = request.headers.get(header)?.split(',').at(-1)?.trim()
    if (value) return value
  }
  return socketIp
}

/** Stops on SIGINT / SIGTERM: closes the server, waits for the change hooks, closes the database. */
export function stopOnSignals(server: ResolvedServer, close: () => Promise<void> | void) {
  const stop = async () => {
    await close()
    await server.drain()
    server.runtime.close()
    process.exit(0)
  }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
}

export function logStarted(runtimeName: string, server: ResolvedServer) {
  logger.info(
    { type: 'server_started', runtime: runtimeName, port: server.port },
    `Kiln CMS listening on http://localhost:${server.port}`,
  )
}
