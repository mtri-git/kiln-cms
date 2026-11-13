import { primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// Join table: no baseColumns, rows are hard-deleted when a post's tag set changes.
export const postTags = sqliteTable(
  'post_tags',
  {
    postId: text('post_id').notNull(),
    tagId: text('tag_id').notNull(),
  },
  (table) => [primaryKey({ columns: [table.postId, table.tagId] })],
)

export type PostTag = typeof postTags.$inferSelect
