import { createRoute } from '@hono/zod-openapi'
import { currentUser, requireAuth } from '../../core/middleware/auth'
import { rateLimit } from '../../core/middleware/rate-limit'
import { bearer, createRouter, errors, jsonBody, okResponse } from '../../core/openapi'
import { created, ok } from '../../core/utils/response'
import { userSchema } from '../users/users.schemas'
import {
  authResultSchema,
  changePasswordSchema,
  loggedOutSchema,
  loginSchema,
  refreshTokenSchema,
  setupSchema,
  tokensSchema,
} from './auth.schemas'
import { authService } from './auth.service'

const TAG = 'Auth'
const router = createRouter()
// One shared counter per client IP for every route that checks or sets a password.
const passwordRateLimit = rateLimit('auth')

router.openapi(
  createRoute({
    method: 'post',
    path: '/setup',
    tags: [TAG],
    summary: 'Create the first admin (only while there are no users)',
    middleware: [passwordRateLimit] as const,
    request: { body: jsonBody(setupSchema) },
    responses: {
      201: okResponse(authResultSchema, 'Created'),
      ...errors.validation,
      ...errors.forbidden,
      ...errors.tooManyRequests,
    },
  }),
  async (c) => created(c, await authService.setup(c.req.valid('json'))),
)

router.openapi(
  createRoute({
    method: 'post',
    path: '/login',
    tags: [TAG],
    summary: 'Sign in',
    middleware: [passwordRateLimit] as const,
    request: { body: jsonBody(loginSchema) },
    responses: {
      200: okResponse(authResultSchema),
      ...errors.validation,
      ...errors.unauthorized,
      ...errors.forbidden,
      ...errors.tooManyRequests,
    },
  }),
  async (c) => ok(c, await authService.login(c.req.valid('json'))),
)

router.openapi(
  createRoute({
    method: 'post',
    path: '/refresh',
    tags: [TAG],
    summary: 'Exchange a refresh token for new tokens (rotates the refresh token)',
    request: { body: jsonBody(refreshTokenSchema) },
    responses: { 200: okResponse(tokensSchema), ...errors.validation, ...errors.unauthorized },
  }),
  async (c) => ok(c, await authService.refresh(c.req.valid('json').refreshToken)),
)

router.openapi(
  createRoute({
    method: 'post',
    path: '/logout',
    tags: [TAG],
    summary: 'Sign out (deletes the refresh token session)',
    request: { body: jsonBody(refreshTokenSchema) },
    responses: { 200: okResponse(loggedOutSchema), ...errors.validation },
  }),
  async (c) => {
    await authService.logout(c.req.valid('json').refreshToken)
    return ok(c, { loggedOut: true as const })
  },
)

router.openapi(
  createRoute({
    method: 'get',
    path: '/me',
    tags: [TAG],
    summary: 'Get the signed-in user',
    security: bearer,
    middleware: [requireAuth] as const,
    responses: { 200: okResponse(userSchema), ...errors.unauthorized },
  }),
  async (c) => ok(c, await authService.me(currentUser(c).userId)),
)

router.openapi(
  createRoute({
    method: 'post',
    path: '/password',
    tags: [TAG],
    summary: 'Change your own password (ends every session and returns new tokens)',
    security: bearer,
    middleware: [requireAuth, passwordRateLimit] as const,
    request: { body: jsonBody(changePasswordSchema) },
    responses: {
      200: okResponse(tokensSchema),
      ...errors.validation,
      ...errors.unauthorized,
      ...errors.tooManyRequests,
    },
  }),
  async (c) => ok(c, await authService.changePassword(currentUser(c).userId, c.req.valid('json'))),
)

export { router as authRouter }
