import { AsyncLocalStorage } from 'node:async_hooks'
import type { DrizzleD1Database } from 'drizzle-orm/d1'

export type DbClient = DrizzleD1Database<Record<string, never>>

/**
 * The bindings, vars and secrets kiln-cms reads. An app with more of them extends this type
 * and reads them with `getEnv<MyEnv>()`.
 */
export type WorkerEnv = {
  DB: D1Database
  BUCKET: R2Bucket
  NODE_ENV: string
  CORS_ALLOW_LIST: string
  R2_PUBLIC_URL: string
  JWT_SECRET: string
}

export type RequestStore = {
  env: WorkerEnv
  db: DbClient
  origin: string
  /** Keeps the Worker alive for work that continues after the response (change hooks). */
  waitUntil: (promise: Promise<unknown>) => void
}

const als = new AsyncLocalStorage<RequestStore>()

export function runWithRequestContext<T>(store: RequestStore, fn: () => T): T {
  return als.run(store, fn)
}

export function getStore(): RequestStore {
  const store = als.getStore()
  if (!store) throw new Error('Request context is not available outside a Worker request')
  return store
}

export function getEnv<Env extends WorkerEnv = WorkerEnv>(): Env {
  return getStore().env as Env
}
