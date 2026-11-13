import { and, asc, count, eq, ne } from 'drizzle-orm'
import { db, Errors, emitChange, getPaginationParams, notDeleted, releasedValue } from 'kiln-cms'
import { type Category, categories } from '../../db/schema'
import type { CreateCategoryInput, ListCategoriesQuery, UpdateCategoryInput } from './categories.schemas'

async function assertSlugFree(slug: string, exceptId?: string): Promise<void> {
  const [taken] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.slug, slug), exceptId ? ne(categories.id, exceptId) : undefined))
    .limit(1)
  if (taken) throw Errors.CONFLICT('Slug already exists')
}

export const categoriesService = {
  async list(query: ListCategoriesQuery) {
    const params = getPaginationParams(query)
    const where = notDeleted(categories)
    const [rows, [{ total }]] = await Promise.all([
      db
        .select()
        .from(categories)
        .where(where)
        .orderBy(asc(categories.order), asc(categories.name))
        .limit(params.limit)
        .offset(params.offset),
      db.select({ total: count() }).from(categories).where(where),
    ])
    return { rows, total, params }
  },

  async getById(id: string): Promise<Category> {
    const [row] = await db
      .select()
      .from(categories)
      .where(and(eq(categories.id, id), notDeleted(categories)))
      .limit(1)
    if (!row) throw Errors.NOT_FOUND('Category')
    return row
  },

  async getBySlug(slug: string): Promise<Category> {
    const [row] = await db
      .select()
      .from(categories)
      .where(and(eq(categories.slug, slug), notDeleted(categories)))
      .limit(1)
    if (!row) throw Errors.NOT_FOUND('Category')
    return row
  },

  async create(input: CreateCategoryInput): Promise<Category> {
    await assertSlugFree(input.slug)
    const [row] = await db.insert(categories).values(input).returning()
    emitChange('categories', 'created', row.id)
    return row
  },

  /** Only the keys present in `input` change; `null` clears a nullable column. */
  async update(id: string, input: UpdateCategoryInput): Promise<Category> {
    await this.getById(id)
    if (input.slug) await assertSlugFree(input.slug, id)
    const [row] = await db.update(categories).set(input).where(eq(categories.id, id)).returning()
    emitChange('categories', 'updated', id)
    return row
  },

  async remove(id: string): Promise<void> {
    const row = await this.getById(id)
    await db
      .update(categories)
      .set({ deletedAt: new Date(), slug: releasedValue(row.slug, row.id) })
      .where(eq(categories.id, id))
    emitChange('categories', 'deleted', id)
  },
}
