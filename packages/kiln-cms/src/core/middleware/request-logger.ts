import type { Context, Next } from 'hono'
import type { AppEnv } from '../types/env'
import { logger } from '../utils/logger'

/**
 * Middleware to log HTTP requests
 * Logs method, path, status code, response time, and request ID
 */
export const requestLoggerMiddleware = async (c: Context<AppEnv>, next: Next) => {
  const startTime = Date.now()
  const method = c.req.method
  const path = c.req.path
  const requestId = c.get('requestId')
  const userAgent = c.req.header('user-agent')
  const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown'

  // Log incoming request
  logger.info(
    {
      type: 'request',
      method,
      path,
      requestId,
      ip,
      userAgent,
    },
    `${method} ${path}`,
  )

  await next()

  // Calculate response time
  const responseTime = Date.now() - startTime
  const status = c.res.status

  // Log response
  const logLevel = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info'
  logger[logLevel](
    {
      type: 'response',
      method,
      path,
      status,
      responseTime,
      requestId,
      ip,
    },
    `${method} ${path} ${status} ${responseTime}ms`,
  )
}
