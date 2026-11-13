import type { Context, Next } from 'hono'
import type { AppEnv } from '../types/env'
import { generateRequestId } from '../utils/gen-id'

/**
 * Middleware to generate and attach request ID for tracing
 */
export const requestIdMiddleware = async (c: Context<AppEnv>, next: Next) => {
  const requestId = c.req.header('X-Request-ID') || generateRequestId()
  c.set('requestId', requestId)
  c.res.headers.set('X-Request-ID', requestId)
  await next()
}
