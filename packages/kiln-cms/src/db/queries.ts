import { and, count, type SQL, sql } from 'drizzle-orm'
import type { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core'
import { Errors } from '../core/utils/error'
import { getPaginationParams, type PaginationParams } from '../core/utils/pagination'
import { db } from './index'
import { notDeleted } from './soft-delete'

/** A table with `baseColumns`: it has `deletedAt`, so its rows can be soft-deleted. */
type SoftDeleteTable = SQLiteTable & { deletedAt: SQLiteColumn }

/**
 * One row matching `where` that is not soft-deleted, or a 404 named after `name`.
 * `findOne(tags, eq(tags.slug, slug), 'Tag')`
 */
export async function findOne<T extends SoftDeleteTable>(
  table: T,
  where: SQL | undefined,
  name: string,
): Promise<T['$inferSelect']> {
  const [row] = await db
    .select()
    .from(table)
    .where(and(where, notDeleted(table)))
    .limit(1)
  if (!row) throw Errors.NOT_FOUND(name)
  return row
}

export type ListPageOptions = {
  /** Extra filter. Soft-deleted rows are always left out. */
  where?: SQL
  orderBy?: (SQL | SQLiteColumn)[]
  /** The `page` and `limit` query parameters. */
  query: { page?: number; limit?: number }
}

/**
 * One page of rows that are not soft-deleted, with the total for the pagination.
 * Pass the result to `paginated(c, rows, total, params)`.
 */
export async function listPage<T extends SoftDeleteTable>(
  table: T,
  { where, orderBy = [], query }: ListPageOptions,
): Promise<{ rows: T['$inferSelect'][]; total: number; params: PaginationParams }> {
  const params = getPaginationParams(query)
  const filter = and(notDeleted(table), where)
  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(table)
      .where(filter)
      .orderBy(...orderBy)
      .limit(params.limit)
      .offset(params.offset),
    db.select({ total: count() }).from(table).where(filter),
  ])
  return { rows, total, params }
}

/**
 * `column` contains `term`, case-insensitive for ASCII (SQLite LIKE). `%` and `_` in `term` match themselves,
 * so a search for "50%" does not match everything that starts with 50.
 */
export function contains(column: SQLiteColumn | SQL, term: string): SQL {
  const pattern = `%${term.replace(/[\\%_]/g, '\\$&')}%`
  return sql`${column} LIKE ${pattern} ESCAPE '\\'`
}
