import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { baseColumns } from 'kiln-cms/schema'

export const tags = sqliteTable('tags', {
  ...baseColumns,
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
})

export type Tag = typeof tags.$inferSelect
export type NewTag = typeof tags.$inferInsert
