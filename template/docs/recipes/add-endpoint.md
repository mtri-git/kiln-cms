# Add an endpoint to an existing module

Adds one route to a module that already exists. Example: a public `GET /api/categories/count` that returns how many live categories there are.
Route handlers hold no logic: they call one service method and return `ok`, `created` or `paginated`.

## Steps

1. Add the database method to `src/modules/categories/categories.service.ts`. It goes inside the `categoriesService` object and throws `Errors.X()` on failure. `count` and `notDeleted` are already imported there:

   ```ts
   async countLive(): Promise<number> {
     const [{ total }] = await db.select({ total: count() }).from(categories).where(notDeleted(categories))
     return total
   },
   ```

2. Add the response schema to `src/modules/categories/categories.schemas.ts`:

   ```ts
   export const categoryCountSchema = z.object({ total: z.number().int() }).openapi('CategoryCount')
   ```

3. Add the route to `src/modules/categories/categories.home-routes.ts`. Public routes have no `security` and no `requireAuth`. Declare `'/count'` above `'/{slug}'`, otherwise `count` is read as a slug:

   ```ts
   router.openapi(
     createRoute({
       method: 'get',
       path: '/count',
       tags: [TAG],
       summary: 'Count live categories',
       responses: { 200: okResponse(categoryCountSchema), ...errors.validation },
     }),
     async (c) => ok(c, { total: await categoriesService.countLive() }),
   )
   ```

   Import `categoryCountSchema` in the same import list as `categorySchema`.

   For an admin endpoint, add the route to `categories.admin-routes.ts` instead. The file already starts with `router.use('*', requireAuth)`, and each route needs `security: bearer`. Add `...errors.unauthorized` to its responses.

4. Add a test under `test/` that calls the endpoint and checks the envelope (`success: true`, `data.total`).

5. Check the route appears in the spec. Start the server and look for `/categories/count` under the `Categories - Public` tag:

   ```sh
   pnpm dev
   ```

   ```sh
   curl -s http://localhost:8787/api/categories/count
   ```

   Expected: `{"success":true,"data":{"total":0},"requestId":"..."}`. Open http://localhost:8787/openapi.json to confirm the path is listed.

6. Run the checks:

   ```sh
   pnpm check
   ```

## Notes

- The route file stays thin: no `db` import and no `if` on data in the handler.
- Use `paginated(c, rows, total, params)` for lists, `created(c, row)` for 201 responses and `ok(c, { id })` for deletes.
- Throw `Errors.NOT_FOUND('Category')` from the service for missing rows. Do not build error responses by hand.
- `pnpm check:conventions` must pass: no `any`, no `new OpenAPIHono(`, and no import from another module except `.service` or `.schemas`.
