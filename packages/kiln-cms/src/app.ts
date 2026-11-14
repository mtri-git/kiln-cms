import type { OpenAPIHono } from '@hono/zod-openapi'
import { Scalar } from '@scalar/hono-api-reference'
import { cors } from 'hono/cors'
import { getCorsOrigins } from './config/env'
import { onChange } from './core/hooks'
import { errorHandler } from './core/middleware/error-handler'
import { requestIdMiddleware } from './core/middleware/request-id'
import { requestLoggerMiddleware } from './core/middleware/request-logger'
import { createRouter } from './core/openapi'
import type { AppEnv } from './core/types/env'
import { deliverWebhooks } from './core/webhooks'
import { authRouter } from './modules/auth/auth.routes'
import { usersAdminRouter } from './modules/users/users.admin-routes'

export type KilnOptions = {
  /** Title and version shown in `/openapi.json` and `/docs`. */
  title?: string
  version?: string
  /**
   * Prefix for the routes kiln-cms mounts itself (`/health`, `/auth`, `/admin/users`, `/openapi.json`, `/docs`),
   * for a Worker that only receives part of a domain: `basePath: '/api'` gives `/api/health`, `/api/auth`...
   * The app's own routes are not moved: `registerRoutes` decides where they go.
   */
  basePath?: string
  /**
   * `false` leaves out `/auth` and `/admin/users`, for an app whose users are signed in somewhere else
   * (Cloudflare Access, another identity provider). The app then writes its own `requireAuth` middleware,
   * which must call `c.set('user', { userId, email, role })`. `JWT_SECRET` is not needed in that case.
   */
  builtInAuth?: boolean
  /** Mounts the app's own routers. `/auth` and `/admin/users` are already mounted. */
  registerRoutes: (app: OpenAPIHono<AppEnv>) => void
  /** Registers change hooks with `onChange`. */
  registerHooks?: () => void
}

/** The Hono app: middleware, error handler, the built-in auth and users routes, then the app's routes. */
export function createApp(options: KilnOptions): OpenAPIHono<AppEnv> {
  const app = createRouter()
  const base = normalizeBasePath(options.basePath)

  app.use(requestIdMiddleware)
  app.use(requestLoggerMiddleware)
  app.use(
    '/*',
    cors({
      origin: (origin) => {
        const allowed = getCorsOrigins()
        if (allowed.includes('*')) return origin || '*'
        return allowed.includes(origin) ? origin : null
      },
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
      exposeHeaders: ['X-Request-ID'],
      maxAge: 86400,
    }),
  )

  app.onError(errorHandler)
  app.notFound((c) =>
    c.json(
      {
        success: false as const,
        error: { code: 'NOT_FOUND', message: 'Route not found' },
        requestId: c.get('requestId'),
      },
      404,
    ),
  )

  app.get(`${base}/health`, (c) => c.json({ status: 'ok' as const }))

  if (options.builtInAuth !== false) {
    app.route(`${base}/auth`, authRouter)
    app.route(`${base}/admin/users`, usersAdminRouter)
  }
  options.registerRoutes(app)
  options.registerHooks?.()
  // Webhooks from WEBHOOK_URLS. The same function every time, so building the app twice registers it once.
  onChange(deliverWebhooks)

  app.openAPIRegistry.registerComponent('securitySchemes', 'Bearer', { type: 'http', scheme: 'bearer' })
  app.doc31(`${base}/openapi.json`, {
    openapi: '3.1.0',
    info: { title: options.title ?? 'Kiln CMS API', version: options.version ?? '0.1.0' },
  })
  app.get(`${base}/docs`, Scalar({ url: `${base}/openapi.json` }))

  return app
}

/** `'api'`, `'/api/'` and `'/api'` all become `'/api'`; nothing or `'/'` becomes `''`. */
function normalizeBasePath(basePath: string | undefined): string {
  const trimmed = (basePath ?? '').replace(/^\/+|\/+$/g, '')
  return trimmed ? `/${trimmed}` : ''
}
