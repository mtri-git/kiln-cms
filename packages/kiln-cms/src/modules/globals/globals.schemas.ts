import { z } from '@hono/zod-openapi'
import { timestamp } from '../../core/openapi'

/** One global the app declares in the `globals` option. */
export type GlobalDefinition = {
  /** What `PUT /admin/globals/{name}` accepts and what is stored. */
  schema: z.ZodType
  /** `false` keeps it out of `GET /api/globals/{name}`: only signed-in users read it. Default `true`. */
  public?: boolean
}

export type GlobalsOption = Record<string, GlobalDefinition>

/** Names go in the URL: lowercase letters, digits and dashes. */
export const GLOBAL_NAME = /^[a-z][a-z0-9-]*$/

/** A global as the API returns it. `data` is `null` and `updatedAt` is `null` until it is first saved. */
export const globalSchema = <T extends z.ZodType>(data: T) =>
  z.object({
    name: z.string(),
    data: data.nullable(),
    updatedAt: timestamp.nullable(),
  })

export type GlobalValue = { name: string; data: unknown; updatedAt: Date | null }
