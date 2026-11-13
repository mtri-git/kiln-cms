import { lte, sql } from 'drizzle-orm'
import type { MiddlewareHandler } from 'hono'
import { db } from '../../db'
import { rateLimits } from '../../db/schema'
import { AUTH_RATE_LIMIT } from '../constants'
import type { AppEnv } from '../types/env'
import { Errors } from '../utils/error'

type RateLimitOptions = { limit: number; windowMs: number }

/**
 * Fixed-window limit per client IP, counted in D1. Every request counts, successful or not.
 * Routes that share a `name` share one counter. Over the limit: 429 with a `Retry-After` header.
 * Use in a route: `middleware: [rateLimit('auth')] as const`.
 */
export const rateLimit =
  (name: string, { limit, windowMs }: RateLimitOptions = AUTH_RATE_LIMIT): MiddlewareHandler<AppEnv> =>
  async (c, next) => {
    // Cloudflare sets CF-Connecting-IP and clients cannot override it. It is absent only in local dev and tests.
    const key = `${name}:${c.req.header('CF-Connecting-IP') ?? 'unknown'}`
    const now = Date.now()
    // One batch: drop every finished window (this key's included), then count this request.
    const [, [row]] = await db.batch([
      db.delete(rateLimits).where(lte(rateLimits.windowStartedAt, new Date(now - windowMs))),
      db
        .insert(rateLimits)
        .values({ key, count: 1, windowStartedAt: new Date(now) })
        .onConflictDoUpdate({ target: rateLimits.key, set: { count: sql`${rateLimits.count} + 1` } })
        .returning(),
    ])
    if (row.count > limit) {
      const retryAfterSeconds = Math.max(1, Math.ceil((row.windowStartedAt.getTime() + windowMs - now) / 1000))
      c.header('Retry-After', String(retryAfterSeconds))
      throw Errors.TOO_MANY_REQUESTS(retryAfterSeconds)
    }
    await next()
  }
