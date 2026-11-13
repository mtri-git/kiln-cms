import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { baseColumns, seoColumns } from 'kiln-cms/schema'

export const categories = sqliteTable(
  'categories',
  {
    ...baseColumns,
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    description: text('description'),
    imageUrl: text('image_url'),
    order: integer('order').notNull().default(0),
    ...seoColumns,
  },
  (table) => [index('idx_categories_order_name').on(table.order, table.name)],
)

export type Category = typeof categories.$inferSelect
export type NewCategory = typeof categories.$inferInsert
