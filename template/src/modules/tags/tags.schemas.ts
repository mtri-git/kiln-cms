import { z } from '@hono/zod-openapi'
import { baseFields, pageQuery } from 'kiln-cms'

/** What the API returns for one tag. */
export const tagSchema = z
  .object({
    ...baseFields,
    name: z.string(),
    slug: z.string(),
  })
  .openapi('Tag')

export const createTagSchema = z
  .object({
    name: z.string().min(1).max(255),
    slug: z.string().min(1).max(255),
  })
  .openapi('CreateTag')

export const updateTagSchema = createTagSchema.partial().openapi('UpdateTag')

export const listTagsQuery = pageQuery

export type CreateTagInput = z.infer<typeof createTagSchema>
export type UpdateTagInput = z.infer<typeof updateTagSchema>
export type ListTagsQuery = z.infer<typeof listTagsQuery>
