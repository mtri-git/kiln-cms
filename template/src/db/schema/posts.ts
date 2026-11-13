import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { baseColumns, seoColumns } from 'kiln-cms/schema'
import type { PostStatus } from '../../constants'

export const posts = sqliteTable(
  'posts',
  {
    ...baseColumns,
    title: text('title').notNull(),
    slug: text('slug').notNull().unique(),
    excerpt: text('excerpt'),
    // Opaque editor document (e.g. Lexical JSON). The API stores it and never inspects it.
    content: text('content', { mode: 'json' }).$type<unknown>(),
    coverImageUrl: text('cover_image_url'),
    categoryId: text('category_id'),
    authorId: text('author_id'),
    status: text('status').$type<PostStatus>().notNull().default('draft'),
    publishedAt: integer('published_at', { mode: 'timestamp_ms' }),
    isFeatured: integer('is_featured', { mode: 'boolean' }).notNull().default(false),
    ...seoColumns,
  },
  (table) => [
    index('idx_posts_status_published_at').on(table.status, table.publishedAt),
    index('idx_posts_category_id').on(table.categoryId),
  ],
)

export type Post = typeof posts.$inferSelect
export type NewPost = typeof posts.$inferInsert
