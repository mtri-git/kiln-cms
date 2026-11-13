import { createRoute } from '@hono/zod-openapi'
import { createRouter, errors, ok, okResponse, pageResponse, paginated, slugParam } from 'kiln-cms'
import { categorySchema, listCategoriesQuery } from './categories.schemas'
import { categoriesService } from './categories.service'

const TAG = 'Categories - Public'
const router = createRouter()

router.openapi(
  createRoute({
    method: 'get',
    path: '/',
    tags: [TAG],
    summary: 'List categories',
    request: { query: listCategoriesQuery },
    responses: { 200: pageResponse(categorySchema), ...errors.validation },
  }),
  async (c) => {
    const { rows, total, params } = await categoriesService.list(c.req.valid('query'))
    return paginated(c, rows, total, params)
  },
)

router.openapi(
  createRoute({
    method: 'get',
    path: '/{slug}',
    tags: [TAG],
    summary: 'Get a category by slug',
    request: { params: slugParam },
    responses: { 200: okResponse(categorySchema), ...errors.notFound },
  }),
  async (c) => ok(c, await categoriesService.getBySlug(c.req.valid('param').slug)),
)

export { router as categoriesHomeRouter }
