import bcrypt from 'bcryptjs'
import { and, count, eq } from 'drizzle-orm'
import { Errors } from '../../core/utils/error'
import { signAccessToken } from '../../core/utils/jwt'
import { db } from '../../db'
import { sessions, type User, users } from '../../db/schema'
import { notDeleted } from '../../db/soft-delete'
import { PASSWORD_ROUNDS, type PublicUser, toPublicUser } from '../users/users.service'
import type { ChangePasswordInput, LoginInput, SetupInput } from './auth.schemas'

const REFRESH_TOKEN_BYTES = 48
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000

type Tokens = { accessToken: string; refreshToken: string }
type AuthResult = Tokens & { user: PublicUser }

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** A fresh refresh token and the session row values that store it (hash only). */
async function newRefreshToken(userId: string) {
  const refreshToken = toBase64Url(crypto.getRandomValues(new Uint8Array(REFRESH_TOKEN_BYTES)))
  const session = {
    userId,
    tokenHash: await hashToken(refreshToken),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
  }
  return { refreshToken, session }
}

function accessTokenFor(user: User): Promise<string> {
  return signAccessToken({ userId: user.id, email: user.email, role: user.role })
}

async function issueTokens(user: User): Promise<Tokens> {
  const { refreshToken, session } = await newRefreshToken(user.id)
  await db.insert(sessions).values(session)
  return { accessToken: await accessTokenFor(user), refreshToken }
}

export const authService = {
  async setup(input: SetupInput): Promise<AuthResult> {
    const [{ total }] = await db.select({ total: count() }).from(users)
    if (total > 0) throw Errors.FORBIDDEN()
    const [user] = await db
      .insert(users)
      .values({
        email: input.email.toLowerCase(),
        passwordHash: await bcrypt.hash(input.password, PASSWORD_ROUNDS),
        fullName: input.fullName,
        role: 'admin',
        lastLoginAt: new Date(),
      })
      .returning()
    return { user: toPublicUser(user), ...(await issueTokens(user)) }
  },

  async login(input: LoginInput): Promise<AuthResult> {
    const [found] = await db
      .select()
      .from(users)
      .where(and(eq(users.email, input.email.toLowerCase()), notDeleted(users)))
      .limit(1)
    if (!found || !(await bcrypt.compare(input.password, found.passwordHash))) throw Errors.INVALID_CREDENTIALS()
    if (!found.isActive) throw Errors.FORBIDDEN()
    const [user] = await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, found.id)).returning()
    return { user: toPublicUser(user), ...(await issueTokens(user)) }
  },

  /** Rotation: the old session row is deleted and a new one created in one batch. */
  async refresh(refreshToken: string): Promise<Tokens> {
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.tokenHash, await hashToken(refreshToken)))
      .limit(1)
    if (!session || session.expiresAt.getTime() <= Date.now()) throw Errors.INVALID_TOKEN()
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, session.userId), notDeleted(users)))
      .limit(1)
    if (!user?.isActive) throw Errors.INVALID_TOKEN()

    const next = await newRefreshToken(user.id)
    await db.batch([db.delete(sessions).where(eq(sessions.id, session.id)), db.insert(sessions).values(next.session)])
    return { accessToken: await accessTokenFor(user), refreshToken: next.refreshToken }
  },

  async logout(refreshToken: string): Promise<void> {
    await db.delete(sessions).where(eq(sessions.tokenHash, await hashToken(refreshToken)))
  },

  /** Ends every session of the user and returns tokens for a new one, so the caller stays signed in. */
  async changePassword(userId: string, input: ChangePasswordInput): Promise<Tokens> {
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, userId), notDeleted(users)))
      .limit(1)
    if (!user?.isActive) throw Errors.UNAUTHORIZED()
    if (!(await bcrypt.compare(input.currentPassword, user.passwordHash))) {
      throw Errors.BAD_REQUEST('Current password is incorrect')
    }

    const next = await newRefreshToken(user.id)
    await db.batch([
      db
        .update(users)
        .set({ passwordHash: await bcrypt.hash(input.newPassword, PASSWORD_ROUNDS) })
        .where(eq(users.id, user.id)),
      db.delete(sessions).where(eq(sessions.userId, user.id)),
      db.insert(sessions).values(next.session),
    ])
    return { accessToken: await accessTokenFor(user), refreshToken: next.refreshToken }
  },

  async me(userId: string): Promise<PublicUser> {
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, userId), notDeleted(users)))
      .limit(1)
    if (!user) throw Errors.UNAUTHORIZED()
    return toPublicUser(user)
  },
}
