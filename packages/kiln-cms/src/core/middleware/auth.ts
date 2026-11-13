import type { MiddlewareHandler } from 'hono'
import type { UserRole } from '../constants'
import type { AppEnv } from '../types/env'
import { Errors } from '../utils/error'
import { extractBearerToken, verifyAccessToken } from '../utils/jwt'

/** Verifies the access token and sets `c.get('user')`. First line of every admin router. */
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = extractBearerToken(c.req.header('Authorization'))
  c.set('user', await verifyAccessToken(token))
  await next()
}

/**
 * Restricts a route to the given roles. Use after `requireAuth`:
 * `router.use('/:id', requireRole('admin'))`.
 */
export const requireRole =
  (...roles: UserRole[]): MiddlewareHandler<AppEnv> =>
  async (c, next) => {
    const user = c.get('user')
    if (!user) throw Errors.UNAUTHORIZED()
    if (!roles.includes(user.role)) throw Errors.FORBIDDEN()
    await next()
  }

/** The signed-in user inside an admin handler. */
export const currentUser = (c: { get: (key: 'user') => AppEnv['Variables']['user'] }) => {
  const user = c.get('user')
  if (!user) throw Errors.UNAUTHORIZED()
  return user
}
