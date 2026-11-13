import type { OpenAPIHono } from '@hono/zod-openapi'
import { type AppEnv, createRouter } from 'kiln-cms'
import { categoriesAdminRouter } from './modules/categories/categories.admin-routes'
import { categoriesHomeRouter } from './modules/categories/categories.home-routes'
import { mediaAdminRouter } from './modules/media/media.admin-routes'
import { mediaFilesRouter } from './modules/media/media.home-routes'
import { postsAdminRouter } from './modules/posts/posts.admin-routes'
import { postsHomeRouter } from './modules/posts/posts.home-routes'
import { tagsAdminRouter } from './modules/tags/tags.admin-routes'
import { tagsHomeRouter } from './modules/tags/tags.home-routes'

/**
 * The route map. One line per router, sorted by module name.
 * - /api/*   public, read-only, no auth
 * - /admin/* protected, each admin router calls `requireAuth` itself
 * kiln-cms already mounts /auth and /admin/users.
 */
export function registerRoutes(app: OpenAPIHono<AppEnv>) {
  const api = createRouter()
  api.route('/categories', categoriesHomeRouter)
  api.route('/posts', postsHomeRouter)
  api.route('/tags', tagsHomeRouter)
  app.route('/api', api)
  app.route('/files', mediaFilesRouter)

  const admin = createRouter()
  admin.route('/categories', categoriesAdminRouter)
  admin.route('/media', mediaAdminRouter)
  admin.route('/posts', postsAdminRouter)
  admin.route('/tags', tagsAdminRouter)
  app.route('/admin', admin)
}
