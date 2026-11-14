import { AsyncLocalStorage } from 'node:async_hooks'
import type { BatchItem, BatchResponse } from 'drizzle-orm/batch'
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core'
import type { FileStorage } from './storage'

/**
 * The Drizzle client of every adapter: D1 on Cloudflare, libSQL (a SQLite file) on Node and Bun.
 * All of them are SQLite and all of them have `batch`, so services work the same everywhere.
 */
export type DbClient = BaseSQLiteDatabase<'async', unknown, Record<string, never>> & {
  batch<U extends BatchItem<'sqlite'>, T extends Readonly<[U, ...U[]]>>(batch: T): Promise<BatchResponse<T>>
}

/**
 * The vars and secrets kiln-cms itself reads, on every adapter. An app with more declares its own type and reads
 * it with `getEnv<MyEnv>()`; that type does not have to extend this one (no `JWT_SECRET` when `builtInAuth` is off).
 */
export type KilnEnv = {
  NODE_ENV?: string
  /** Origins allowed to call the API from a browser, separated by `|`. `*` allows every origin. */
  CORS_ALLOW_LIST?: string
  /** Public base URL of the stored files. Empty serves them through the app at `/files/*`. */
  FILES_PUBLIC_URL?: string
  /** Older name of `FILES_PUBLIC_URL`, still read when `FILES_PUBLIC_URL` is not set. */
  R2_PUBLIC_URL?: string
  JWT_SECRET: string
  /** URLs that receive a POST for every content change, separated by `|`. Empty sends no webhooks. */
  WEBHOOK_URLS?: string
  /** Key for the `X-Kiln-Signature` HMAC of each webhook. Empty sends them unsigned. */
  WEBHOOK_SECRET?: string
  /** Events to send, separated by `|`: `posts.published`, `posts.*`, `*.deleted`. Empty sends every event. */
  WEBHOOK_EVENTS?: string
}

/** What an adapter gives each request. */
export type RuntimeContext = {
  env: object
  db: DbClient
  storage: FileStorage
  /** IP of the client, when the adapter knows it. Rate limits count per IP. */
  clientIp?: string
  /** Keeps work going after the response is sent (change hooks). */
  waitUntil: (promise: Promise<unknown>) => void
}

export type RequestStore = RuntimeContext & {
  /** Origin of the current request (`https://cms.example.com`). */
  origin: string
}

const als = new AsyncLocalStorage<RequestStore>()

export function runWithRequestContext<T>(store: RequestStore, fn: () => T): T {
  return als.run(store, fn)
}

export function getStore(): RequestStore {
  const store = als.getStore()
  if (!store) throw new Error('Request context is not available outside a request')
  return store
}

export function getEnv<Env extends object = KilnEnv>(): Env {
  return getStore().env as Env
}

/** The file storage of the adapter: R2 on Cloudflare, a folder on Node and Bun. */
export function getStorage(): FileStorage {
  return getStore().storage
}
