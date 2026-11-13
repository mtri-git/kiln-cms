import type { Context } from 'hono'
import type { AppEnv } from '../types/env'
import type { PaginationParams } from './pagination'
import { getPaginationMeta } from './pagination'

/**
 * The only three success shapes of the API. Errors are never built by hand:
 * throw `Errors.X()` and the global error handler formats them.
 */

/** 200 `{ success, data, requestId }` */
export const ok = <T>(c: Context<AppEnv>, data: T) =>
  c.json({ success: true as const, data, requestId: c.get('requestId') }, 200)

/** 201 `{ success, data, requestId }` */
export const created = <T>(c: Context<AppEnv>, data: T) =>
  c.json({ success: true as const, data, requestId: c.get('requestId') }, 201)

/** 200 `{ success, data: [], pagination, requestId }` */
export const paginated = <T>(c: Context<AppEnv>, rows: T[], total: number, params: PaginationParams) =>
  c.json(
    {
      success: true as const,
      data: rows,
      pagination: getPaginationMeta(total, params.page, params.limit),
      requestId: c.get('requestId'),
    },
    200,
  )
