import { createRoute } from '@hono/zod-openapi'
import { currentUser, requireAuth } from '../../core/middleware/auth'
import { bearer, createRouter, errors, jsonBody, okResponse } from '../../core/openapi'
import { ok } from '../../core/utils/response'
import { GLOBAL_NAME, type GlobalsOption, globalSchema } from './globals.schemas'
import { globalsService } from './globals.service'

/**
 * One route per declared global, so each one is validated by its own schema and documented in `/openapi.json`.
 * - `GET /api/globals/{name}`   public read (unless `public: false`)
 * - `GET /admin/globals/{name}` read for signed-in users
 * - `PUT /admin/globals/{name}` replace the document
 */
export function createGlobalsRouters(definitions: GlobalsOption) {
  const home = createRouter()
  const admin = createRouter()
  admin.use('*', requireAuth)

  for (const [name, definition] of Object.entries(definitions)) {
    if (!GLOBAL_NAME.test(name)) {
      throw new Error(`Global name "${name}" must be lowercase letters, digits and dashes, starting with a letter`)
    }
    const response = globalSchema(definition.schema)

    if (definition.public !== false) {
      home.openapi(
        createRoute({
          method: 'get',
          path: `/${name}`,
          tags: ['Globals - Public'],
          summary: `Get the ${name} global`,
          responses: { 200: okResponse(response) },
        }),
        async (c) => ok(c, await globalsService.get(name)),
      )
    }

    admin.openapi(
      createRoute({
        method: 'get',
        path: `/${name}`,
        tags: ['Globals - Admin'],
        summary: `Get the ${name} global`,
        security: bearer,
        responses: { 200: okResponse(response), ...errors.unauthorized },
      }),
      async (c) => ok(c, await globalsService.get(name)),
    )

    admin.openapi(
      createRoute({
        method: 'put',
        path: `/${name}`,
        tags: ['Globals - Admin'],
        summary: `Replace the ${name} global`,
        security: bearer,
        request: { body: jsonBody(definition.schema) },
        responses: { 200: okResponse(response), ...errors.validation, ...errors.unauthorized },
      }),
      async (c) => ok(c, await globalsService.put(name, c.req.valid('json'), currentUser(c).userId)),
    )
  }

  return { home, admin }
}
