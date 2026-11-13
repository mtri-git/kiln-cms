import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { baseColumns } from 'kiln-cms/schema'

export const media = sqliteTable(
  'media',
  {
    ...baseColumns,
    /** Original file name as uploaded. */
    fileName: text('file_name').notNull(),
    /** Key of the file in the storage (R2 on Cloudflare, a folder on Node and Bun). */
    key: text('key').notNull().unique(),
    contentType: text('content_type').notNull(),
    /** Size in bytes. */
    size: integer('size').notNull(),
    alt: text('alt'),
    width: integer('width'),
    height: integer('height'),
    uploadedBy: text('uploaded_by'),
  },
  (table) => [index('idx_media_created_at').on(table.createdAt)],
)

export type Media = typeof media.$inferSelect
export type NewMedia = typeof media.$inferInsert
