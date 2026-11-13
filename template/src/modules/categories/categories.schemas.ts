import { z } from '@hono/zod-openapi'
import { baseFields, pageQuery, seoFields } from 'kiln-cms'

/** What the API returns for one category. */
export const categorySchema = z
  .object({
    ...baseFields,
    name: z.string(),
    slug: z.string(),
    description: z.string().nullable(),
    imageUrl: z.string().nullable(),
    order: z.number().int(),
    ...seoFields,
  })
  .openapi('Category')

export const createCategorySchema = z
  .object({
    name: z.string().min(1).max(255),
    slug: z.string().min(1).max(255),
    description: z.string().nullable().optional(),
    imageUrl: z.string().url().nullable().optional(),
    order: z.number().int().optional(),
    metaTitle: seoFields.metaTitle.optional(),
    metaDescription: seoFields.metaDescription.optional(),
    metaKeywords: seoFields.metaKeywords.optional(),
  })
  .openapi('CreateCategory')

export const updateCategorySchema = createCategorySchema.partial().openapi('UpdateCategory')

export const listCategoriesQuery = pageQuery

export type CreateCategoryInput = z.infer<typeof createCategorySchema>
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>
export type ListCategoriesQuery = z.infer<typeof listCategoriesQuery>
