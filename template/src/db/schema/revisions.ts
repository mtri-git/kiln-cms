import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { baseColumns } from 'kiln-cms/schema'

export const revisions = sqliteTable(
  'revisions',
  {
    ...baseColumns,
    postId: text('post_id').notNull(),
    // Full post payload (including tagIds) at the moment of publishing.
    snapshot: text('snapshot', { mode: 'json' }).$type<unknown>().notNull(),
    createdBy: text('created_by'),
  },
  (table) => [index('idx_revisions_post_id').on(table.postId)],
)

export type Revision = typeof revisions.$inferSelect
export type NewRevision = typeof revisions.$inferInsert
