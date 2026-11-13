import type { OpenAPIHono } from '@hono/zod-openapi'
import { Scalar } from '@scalar/hono-api-reference'
import { cors } from 'hono/cors'
import { getCorsOrigins } from './config/env'
import { errorHandler } from './core/middleware/error-handler'
import { requestIdMiddleware } from './core/middleware/request-id'
import { requestLoggerMiddleware } from './core/middleware/request-logger'
import { createRouter } from './core/openapi'
import type { AppEnv } from './core/types/env'
import { authRouter } from './modules/auth/auth.routes'
import { usersAdminRouter } from './modules/users/users.admin-routes'

export type KilnOptions = {
  /** Title and version shown in `/openapi.json` and `/docs`. */
  title?: string
  version?: string
  /** Mounts the app's own routers. `/auth` and `/admin/users` are already mounted. */
  registerRoutes: (app: OpenAPIHono<AppEnv>) => void
  /** Registers change hooks with `onChange`. */
  registerHooks?: () => void
}

/** The Hono app: middleware, error handler, the built-in auth and users routes, then the app's routes. */
export function createApp(options: KilnOptions): OpenAPIHono<AppEnv> {
  const app = createRouter()

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
      allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
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

  app.get('/health', (c) => c.json({ status: 'ok' as const }))

  app.route('/auth', authRouter)
  app.route('/admin/users', usersAdminRouter)
  options.registerRoutes(app)
  options.registerHooks?.()

  app.openAPIRegistry.registerComponent('securitySchemes', 'Bearer', { type: 'http', scheme: 'bearer' })
  app.doc31('/openapi.json', {
    openapi: '3.1.0',
    info: { title: options.title ?? 'Kiln CMS API', version: options.version ?? '0.1.0' },
  })
  app.get('/docs', Scalar({ url: '/openapi.json' }))

  return app
}
