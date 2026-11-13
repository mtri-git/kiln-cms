// kiln-cms/cloudflare: run the app as a Cloudflare Worker, with D1 for data and R2 for files.
import { drizzle } from 'drizzle-orm/d1'
import type { KilnOptions } from '../app'
import type { KilnEnv } from '../core/request-context'
import type { FileStorage } from '../core/storage'
import { createHandler } from '../handler'

/** The bindings, vars and secrets of a kiln-cms Worker: the D1 database `DB`, the R2 bucket `BUCKET` and `KilnEnv`. */
export type WorkerEnv = KilnEnv & {
  DB: D1Database
  BUCKET: R2Bucket
}

/** Files in an R2 bucket. */
export function r2Storage(bucket: R2Bucket): FileStorage {
  return {
    async put(key, data, { contentType }) {
      await bucket.put(key, data, { httpMetadata: { contentType } })
    },
    async get(key) {
      const object = await bucket.get(key)
      if (!object) return null
      return {
        body: object.body,
        contentType: object.httpMetadata?.contentType ?? 'application/octet-stream',
        size: object.size,
        etag: object.httpEtag,
      }
    },
    async delete(key) {
      await bucket.delete(key)
    },
  }
}

/** A storage for a Worker without a `BUCKET` binding: every call fails with a clear message. */
const missingBucket: FileStorage = {
  put: () => Promise.reject(new Error('No R2 bucket bound as BUCKET in wrangler.jsonc')),
  get: () => Promise.reject(new Error('No R2 bucket bound as BUCKET in wrangler.jsonc')),
  delete: () => Promise.reject(new Error('No R2 bucket bound as BUCKET in wrangler.jsonc')),
}

/** The Worker entry. In the app: `export default createWorker({ registerRoutes, registerHooks })`. */
export function createWorker(options: KilnOptions) {
  const handle = createHandler(options)
  return {
    fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
      return handle(request, {
        env,
        db: drizzle(env.DB),
        storage: env.BUCKET ? r2Storage(env.BUCKET) : missingBucket,
        // Cloudflare sets CF-Connecting-IP and clients cannot override it. It is absent only in local dev and tests.
        clientIp: request.headers.get('CF-Connecting-IP') ?? undefined,
        waitUntil: (promise) => ctx.waitUntil(promise),
      })
    },
  }
}
