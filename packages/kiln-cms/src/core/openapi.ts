import { OpenAPIHono, z } from '@hono/zod-openapi'
import type { AppEnv } from './types/env'

/**
 * Building blocks for route definitions. Every route file uses these so that
 * all endpoints share one envelope and one OpenAPI style.
 */

/** Router with the standard validation-error response. Always use this, never `new OpenAPIHono()`. */
export const createRouter = () =>
  new OpenAPIHono<AppEnv>({
    defaultHook: (result, c) => {
      if (result.success) return
      return c.json(
        {
          success: false as const,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: result.error.issues,
          },
          requestId: c.get('requestId'),
        },
        400,
      )
    },
  })

// ---- Schemas -------------------------------------------------------------

export const errorSchema = z
  .object({
    success: z.literal(false),
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
    }),
    requestId: z.string().optional(),
  })
  .openapi('Error')

export const paginationSchema = z
  .object({
    total: z.number(),
    page: z.number(),
    limit: z.number(),
    totalPages: z.number(),
    hasMore: z.boolean(),
  })
  .openapi('Pagination')

/** ISO date-time string. Drizzle returns `Date`; JSON serialization turns it into this. */
export const timestamp = z.string().openapi({ format: 'date-time', example: '2026-01-01T00:00:00.000Z' })

/** Columns every table has (see `db/schema/base-columns.ts`), as they appear in responses. */
export const baseFields = {
  id: z.string(),
  createdAt: timestamp,
  updatedAt: timestamp,
}

/** SEO columns (see `db/schema/seo-columns.ts`), for both request bodies and responses. */
export const seoFields = {
  metaTitle: z.string().max(255).nullable(),
  metaDescription: z.string().max(500).nullable(),
  metaKeywords: z.string().max(500).nullable(),
}

// ---- Request parts -------------------------------------------------------

export const idParam = z.object({
  id: z
    .string()
    .min(1)
    .openapi({ param: { name: 'id', in: 'path' } }),
})

export const slugParam = z.object({
  slug: z
    .string()
    .min(1)
    .openapi({ param: { name: 'slug', in: 'path' } }),
})

export const pageQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
})

export const jsonBody = <T extends z.ZodType>(schema: T) => ({
  required: true as const,
  content: { 'application/json': { schema } },
})

// ---- Response parts ------------------------------------------------------

const json = <T extends z.ZodType>(schema: T, description: string) => ({
  description,
  content: { 'application/json': { schema } },
})

/** Response `{ success, data }` for one item. */
export const okResponse = <T extends z.ZodType>(data: T, description = 'OK') =>
  json(z.object({ success: z.literal(true), data, requestId: z.string().optional() }), description)

/** Response `{ success, data: [], pagination }` for a list. */
export const pageResponse = <T extends z.ZodType>(item: T, description = 'OK') =>
  json(
    z.object({
      success: z.literal(true),
      data: z.array(item),
      pagination: paginationSchema,
      requestId: z.string().optional(),
    }),
    description,
  )

/** Spread into `responses`: `{ 200: okResponse(x), ...errors.notFound }`. */
export const errors = {
  validation: { 400: json(errorSchema, 'Invalid request data') },
  unauthorized: { 401: json(errorSchema, 'Missing or invalid token') },
  forbidden: { 403: json(errorSchema, 'Role not allowed') },
  notFound: { 404: json(errorSchema, 'Not found') },
  conflict: { 409: json(errorSchema, 'Conflict') },
  tooManyRequests: { 429: json(errorSchema, 'Too many attempts, see the Retry-After header') },
} as const

/** Spread into every admin route: `security: bearer`. */
export const bearer = [{ Bearer: [] }]
