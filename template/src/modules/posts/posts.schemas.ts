import { z } from '@hono/zod-openapi'
import { baseFields, pageQuery, seoFields, timestamp } from 'kiln-cms'
import { POST_STATUSES } from '../../constants'

const refSchema = z.object({ id: z.string(), name: z.string(), slug: z.string() })

const postFields = {
  ...baseFields,
  title: z.string(),
  slug: z.string(),
  excerpt: z.string().nullable(),
  coverImageUrl: z.string().nullable(),
  categoryId: z.string().nullable(),
  authorId: z.string().nullable(),
  status: z.enum(POST_STATUSES),
  publishedAt: timestamp.nullable(),
  isFeatured: z.boolean(),
  ...seoFields,
  category: refSchema.nullable(),
  tags: z.array(refSchema),
}

/** A post in a list: everything except the (potentially large) content. */
export const postListItemSchema = z.object(postFields).openapi('PostListItem')

/** What the API returns for one post. `content` is an opaque editor document. */
export const postSchema = z.object({ ...postFields, content: z.unknown().nullable() }).openapi('Post')

export const createPostSchema = z
  .object({
    title: z.string().min(1).max(255),
    slug: z.string().min(1).max(255),
    excerpt: z.string().nullable().optional(),
    content: z.unknown().nullable().optional(),
    coverImageUrl: z.string().url().nullable().optional(),
    categoryId: z.string().min(1).nullable().optional(),
    isFeatured: z.boolean().optional(),
    metaTitle: seoFields.metaTitle.optional(),
    metaDescription: seoFields.metaDescription.optional(),
    metaKeywords: seoFields.metaKeywords.optional(),
    tagIds: z.array(z.string().min(1)).max(50).optional(),
  })
  .openapi('CreatePost')

export const updatePostSchema = createPostSchema.partial().openapi('UpdatePost')

export const revisionSchema = z
  .object({
    id: z.string(),
    createdAt: timestamp,
    createdBy: z.string().nullable(),
  })
  .openapi('PostRevision')

/** The post payload stored in a revision. */
export const postSnapshotSchema = z.object({
  title: z.string(),
  slug: z.string(),
  excerpt: z.string().nullable(),
  content: z.unknown().nullable(),
  coverImageUrl: z.string().nullable(),
  categoryId: z.string().nullable(),
  isFeatured: z.boolean(),
  metaTitle: z.string().nullable(),
  metaDescription: z.string().nullable(),
  metaKeywords: z.string().nullable(),
  tagIds: z.array(z.string()),
})

export const revisionParam = z.object({
  id: z
    .string()
    .min(1)
    .openapi({ param: { name: 'id', in: 'path' } }),
  revisionId: z
    .string()
    .min(1)
    .openapi({ param: { name: 'revisionId', in: 'path' } }),
})

export const listPublicPostsQuery = pageQuery
  .extend({
    category: z.string().min(1).optional(),
    tag: z.string().min(1).optional(),
    featured: z.enum(['true', 'false']).optional(),
    search: z.string().min(1).optional(),
  })
  .openapi('ListPublicPostsQuery')

export const listAdminPostsQuery = pageQuery
  .extend({
    status: z.enum(POST_STATUSES).optional(),
    search: z.string().min(1).optional(),
    categoryId: z.string().min(1).optional(),
  })
  .openapi('ListAdminPostsQuery')

export type CreatePostInput = z.infer<typeof createPostSchema>
export type UpdatePostInput = z.infer<typeof updatePostSchema>
export type PostSnapshot = z.infer<typeof postSnapshotSchema>
export type ListPublicPostsQuery = z.infer<typeof listPublicPostsQuery>
export type ListAdminPostsQuery = z.infer<typeof listAdminPostsQuery>
