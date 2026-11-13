import { sign, verify } from 'hono/jwt'
import { getEnv } from '../request-context'
import type { AuthUser } from '../types/env'
import { Errors } from './error'

/** Access tokens are short-lived JWTs. Refresh tokens are opaque and live in the `sessions` table. */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60

export async function signAccessToken(user: AuthUser): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  return sign({ ...user, iat: now, exp: now + ACCESS_TOKEN_TTL_SECONDS }, getEnv().JWT_SECRET)
}

export async function verifyAccessToken(token: string): Promise<AuthUser> {
  try {
    const payload = await verify(token, getEnv().JWT_SECRET, 'HS256')
    return {
      userId: String(payload.userId),
      email: String(payload.email),
      role: payload.role as AuthUser['role'],
    }
  } catch {
    throw Errors.INVALID_TOKEN()
  }
}

/** Reads `Authorization: Bearer <token>`. */
export function extractBearerToken(header?: string): string {
  const [scheme, token] = (header ?? '').split(' ')
  if (scheme !== 'Bearer' || !token) throw Errors.UNAUTHORIZED()
  return token
}
