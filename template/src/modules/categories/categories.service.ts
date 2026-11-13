import { and, asc, eq, ne } from 'drizzle-orm'
import { db, Errors, emitChange, findOne, listPage, releasedValue } from 'kiln-cms'
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
  list(query: ListCategoriesQuery) {
    return listPage(categories, { orderBy: [asc(categories.order), asc(categories.name)], query })
  },

  getById(id: string): Promise<Category> {
    return findOne(categories, eq(categories.id, id), 'Category')
  },

  getBySlug(slug: string): Promise<Category> {
    return findOne(categories, eq(categories.slug, slug), 'Category')
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
