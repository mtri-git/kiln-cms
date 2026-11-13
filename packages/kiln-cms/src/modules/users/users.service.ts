import bcrypt from 'bcryptjs'
import { and, count, desc, eq, or } from 'drizzle-orm'
import { Errors } from '../../core/utils/error'
import { getPaginationParams } from '../../core/utils/pagination'
import { db } from '../../db'
import { contains } from '../../db/queries'
import { sessions, type User, users } from '../../db/schema'
import { notDeleted, releasedValue } from '../../db/soft-delete'
import type { CreateUserInput, ListUsersQuery, UpdateUserInput } from './users.schemas'

export const PASSWORD_ROUNDS = 10

export type PublicUser = Omit<User, 'passwordHash' | 'deletedAt'>

/** Strips the fields that must never leave the API. */
export function toPublicUser(user: User): PublicUser {
  const { passwordHash: _passwordHash, deletedAt: _deletedAt, ...rest } = user
  return rest
}

async function assertEmailFree(email: string): Promise<void> {
  const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
  if (taken) throw Errors.CONFLICT('Email already exists')
}

async function findById(id: string): Promise<User> {
  const [row] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, id), notDeleted(users)))
    .limit(1)
  if (!row) throw Errors.NOT_FOUND('User')
  return row
}

export const usersService = {
  async list(query: ListUsersQuery) {
    const params = getPaginationParams(query)
    const where = and(
      notDeleted(users),
      query.search ? or(contains(users.email, query.search), contains(users.fullName, query.search)) : undefined,
      query.role ? eq(users.role, query.role) : undefined,
      query.isActive === undefined ? undefined : eq(users.isActive, query.isActive),
    )
    const [rows, [{ total }]] = await Promise.all([
      db.select().from(users).where(where).orderBy(desc(users.createdAt)).limit(params.limit).offset(params.offset),
      db.select({ total: count() }).from(users).where(where),
    ])
    return { rows: rows.map(toPublicUser), total, params }
  },

  async getById(id: string): Promise<PublicUser> {
    return toPublicUser(await findById(id))
  },

  async create(input: CreateUserInput): Promise<PublicUser> {
    const email = input.email.toLowerCase()
    await assertEmailFree(email)
    const [row] = await db
      .insert(users)
      .values({
        email,
        passwordHash: await bcrypt.hash(input.password, PASSWORD_ROUNDS),
        fullName: input.fullName,
        role: input.role,
      })
      .returning()
    return toPublicUser(row)
  },

  /** Only the keys present in `input` change. Deactivating or changing the password ends the user's sessions. */
  async update(actorId: string, id: string, input: UpdateUserInput): Promise<PublicUser> {
    await findById(id)
    if (id === actorId) {
      if (input.isActive === false) throw Errors.BAD_REQUEST('You cannot deactivate yourself')
      if (input.role && input.role !== 'admin') throw Errors.BAD_REQUEST('You cannot remove your own admin role')
    }
    const { password, ...fields } = input
    const [row] = await db
      .update(users)
      .set({ ...fields, ...(password ? { passwordHash: await bcrypt.hash(password, PASSWORD_ROUNDS) } : {}) })
      .where(eq(users.id, id))
      .returning()
    if (password || input.isActive === false) await db.delete(sessions).where(eq(sessions.userId, id))
    return toPublicUser(row)
  },

  async remove(actorId: string, id: string): Promise<void> {
    const row = await findById(id)
    if (id === actorId) throw Errors.BAD_REQUEST('You cannot delete yourself')
    await db.batch([
      db
        .update(users)
        .set({ deletedAt: new Date(), email: releasedValue(row.email, row.id) })
        .where(eq(users.id, id)),
      db.delete(sessions).where(eq(sessions.userId, id)),
    ])
  },
}
