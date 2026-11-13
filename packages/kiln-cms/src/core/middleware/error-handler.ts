import type { ErrorHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { isProduction } from '../../config/env'
import type { AppEnv } from '../types/env'
import { ApiError } from '../utils/error'
import { logger } from '../utils/logger'

/** Turns every thrown error into the standard error envelope. Registered once in `app.ts`. */
export const errorHandler: ErrorHandler<AppEnv> = (err, c) => {
  const requestId = c.get('requestId')
  const fail = (status: number, code: string, message: string, details?: unknown) =>
    c.json({ success: false as const, error: { code, message, details }, requestId }, status as ContentfulStatusCode)

  if (err instanceof ApiError) return fail(err.statusCode, err.code, err.message, err.details)
  if (err instanceof HTTPException) return fail(err.status, 'HTTP_ERROR', err.message)

  logger.error(
    { type: 'error', requestId, method: c.req.method, path: c.req.path, name: err.name, stack: err.stack },
    err.message,
  )
  return fail(500, 'INTERNAL_ERROR', isProduction() ? 'Internal server error' : err.message)
}
