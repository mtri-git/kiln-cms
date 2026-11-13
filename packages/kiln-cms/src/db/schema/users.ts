import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { USER_ROLES } from '../../core/constants'
import { baseColumns } from './base-columns'

export const users = sqliteTable(
  'users',
  {
    ...baseColumns,
    email: text('email').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    fullName: text('full_name').notNull(),
    role: text('role', { enum: USER_ROLES }).notNull().default('editor'),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    lastLoginAt: integer('last_login_at', { mode: 'timestamp_ms' }),
  },
  (table) => [index('idx_users_role').on(table.role)],
)

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
