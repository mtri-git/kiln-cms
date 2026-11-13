# Kiln CMS app

A headless CMS API on Hono and Drizzle (SQLite). The same code runs on Cloudflare Workers (D1, R2), Node.js or
Bun (a SQLite file, a folder for files).
Frontends are separate projects that call this API. This file is the contract for anyone changing the code.

The app is built on the `kiln-cms` package. The package holds the shared code (router helpers, responses,
errors, middleware, hooks, the `auth` and `users` modules and their tables). This repo holds the content
modules, the route map, the hooks and the migrations. Upgrade the package with `pnpm update kiln-cms`.

## Commands

| Command                  | Use                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------ |
| `pnpm dev`               | Run locally on Cloudflare's runtime at http://localhost:8787 (`/docs` shows the API) |
| `pnpm dev:node`          | Run locally on Node.js (`bun run dev:bun` for Bun)                                   |
| `pnpm check`             | Typecheck + convention check + tests. Run before finishing any task                  |
| `pnpm gen:module <name>` | Create a new module from the reference module                                        |
| `pnpm db:generate`       | Create a migration after changing `src/db/schema/`                                   |
| `pnpm db:migrate:local`  | Apply migrations to the local D1 (Node.js and Bun apply them at startup)             |

First run on Cloudflare: copy `.dev.vars.example` to `.dev.vars`, then `pnpm install` and `pnpm db:migrate:local`.
First run on Node.js or Bun: copy `.env.example` to `.env`, then `pnpm install`.

## Layout

```
src/
  app.ts               The app: title, version, registerRoutes, registerHooks. Shared by every runtime
  worker.ts            Cloudflare entry: createWorker(appOptions). Do not change
  server.ts            Node.js entry: serve(appOptions). Do not change
  server.bun.ts        Bun entry: serve(appOptions). Do not change
  routes.ts            Route map: one line per router
  hooks.ts             Change hooks: one onChange(...) per handler
  constants.ts         Shared constants of this app (POST_STATUSES...)
  db/schema/           One file per table, all re-exported from index.ts
  modules/<name>/      One folder per resource (see below)
migrations/            Generated SQL. Never edit by hand
docs/recipes/          Step-by-step guides for common tasks
test/                  One test file per module
```

## What comes from `kiln-cms`

Import these from `'kiln-cms'`. Never import from a path inside the package, and never copy its code here.

| Import                                                                        | Use                                                  |
| ----------------------------------------------------------------------------- | ---------------------------------------------------- |
| `createRouter`, `okResponse`, `pageResponse`, `errors`, `jsonBody`, `bearer`  | Route definitions                                    |
| `idParam`, `slugParam`, `pageQuery`, `baseFields`, `seoFields`, `timestamp`   | Zod parts for params, queries, responses             |
| `ok`, `created`, `paginated`                                                  | Success responses                                    |
| `Errors`                                                                      | `Errors.NOT_FOUND('X')`, `Errors.CONFLICT('...')`... |
| `requireAuth`, `requireRole`, `currentUser`, `rateLimit`                      | Middleware                                           |
| `db`, `findOne`, `listPage`, `contains`, `notDeleted`, `releasedValue`        | Database access in services (see Database below)     |
| `getPaginationParams`, `generateId`                                           | Paging by hand, new ids                              |
| `emitChange`, `onChange`                                                      | Change hooks                                         |
| `getEnv`, `getFilesBaseUrl`, `getStorage`, `KilnEnv`, `AppEnv`                | Vars, secrets, bindings and stored files             |
| `users`, `sessions`, `rateLimits`, `usersService`, `userSchema`, `USER_ROLES` | The built-in users and their tables                  |

Schema files import `baseColumns` and `seoColumns` from `'kiln-cms/schema'`.

The package mounts `/auth/*`, `/admin/users`, `/health`, `/openapi.json` and `/docs`. To change how they
behave, change the `kiln-cms` package, not this app.
The app options (`src/app.ts`) have two settings for apps that need them: `basePath` (prefix for those routes) and
`builtInAuth: false` (no `/auth` and `/admin/users`, the app signs users in itself).

## Module shape

Every module is a folder `src/modules/<name>/` with exactly these four files.
`src/modules/categories/` is the reference: copy its style exactly.

| File                     | Holds                                                                      |
| ------------------------ | -------------------------------------------------------------------------- |
| `<name>.schemas.ts`      | Zod schemas for responses, request bodies and queries, plus inferred types |
| `<name>.service.ts`      | All database access and business rules. Throws `Errors.X()`                |
| `<name>.home-routes.ts`  | Public read-only routes, mounted under `/api`                              |
| `<name>.admin-routes.ts` | Protected routes, mounted under `/admin`                                   |

A module with no public routes omits `home-routes`; one with no admin routes omits `admin-routes`.
One exception exists: `media.home-routes.ts` serves binary files at `/files/*` with a plain handler.

A module may import another module's `.service` or `.schemas` file, nothing else.

## Rules

Routes

- Create routers with `createRouter()`, never `new OpenAPIHono()`.
- Define every route with `createRoute({...})` and read input only through `c.req.valid('query' | 'param' | 'json')`.
- Route handlers contain no logic: call one service method, return `ok`, `created` or `paginated`.
- Admin route files start with `router.use('*', requireAuth)` and every admin route sets `security: bearer`.
- Restrict by role with `requireRole('admin')`. Roles are `admin` and `editor` (`USER_ROLES`).
- Path params use braces: `'/{id}'`, `'/{slug}'`.
- Register each router with one line in `src/routes.ts`.

Responses

- Success: `{ success: true, data, requestId }`; lists add `pagination`. Build them only with `ok`, `created`, `paginated`.
- Errors: throw `Errors.X()`. Never build an error response by hand.
- Delete returns `ok(c, { id })`.

Database

- Every table spreads `baseColumns` (id, createdAt, updatedAt, deletedAt). Content tables also spread `seoColumns`.
- Rows are soft-deleted: set `deletedAt`, and every read filters with `notDeleted(table)`.
- Read one row with `findOne(table, where, 'Name')` (404 when missing) and a page with `listPage(table, { where, orderBy, query })`. Both leave out soft-deleted rows. Write the query by hand when you need other columns or joins (see `posts`).
- Search text with `contains(column, term)`, never `like(column, `%${term}%`)`: it makes `%` and `_` in the term match themselves.
- When soft-deleting a row with a unique column, store `releasedValue(value, id)` in it.
- Column names are snake_case in SQL and camelCase in TypeScript.
- No interactive transactions (D1 has none): use `db.batch([...])` when several writes must succeed together. It works on every runtime.
- Never use a Cloudflare-only or Node-only API in `src/` outside the entries: files go through `getStorage()`, vars through `getEnv()`.
- After changing a schema file: export it from `db/schema/index.ts`, then run `pnpm db:generate`.
- `db/schema/index.ts` keeps the line `export * from 'kiln-cms/schema'`: it adds the package's tables to the migrations.
- After `pnpm update kiln-cms`, run `pnpm db:generate`. It creates a migration when the package's tables changed.
- Migrations only add. Never drop or rename a column that holds data. The one exception: removing a whole module on purpose ([remove a module](docs/recipes/remove-module.md)).

Hooks

- A service calls `emitChange(resource, action, id)` after each successful write to content (`created`, `updated`, `deleted`, `published`, `unpublished`). `users` and `auth` do not emit.
- Handlers are registered only in `src/hooks.ts`. They run after the response and cannot fail the request. See `docs/recipes/add-hook.md`.

Types

- No `any` and no `as any`. If the types fight you, the schema and the service disagree: fix one of them.
- Response schemas describe JSON: dates are `timestamp` (string), not `z.date()`.

## Auth

Provided by `kiln-cms`.

- `POST /auth/setup` creates the first admin and works only while the users table is empty.
- `POST /auth/login` returns `{ user, accessToken, refreshToken }`: the access token is a JWT valid 15 minutes, the refresh token is opaque, valid 30 days, and stored only as a hash in `sessions`.
- `POST /auth/refresh` `{ refreshToken }` returns a new pair and invalidates the old refresh token.
- `POST /auth/logout` `{ refreshToken }` deletes that session. `GET /auth/me` returns the signed-in user.
- Send `Authorization: Bearer <accessToken>` to `/admin/*`.
- `POST /auth/password` `{ currentPassword, newPassword }` changes the signed-in user's own password, deletes all their sessions and returns a new token pair.
- Deactivating or deleting a user, or changing their password, deletes their sessions. Access tokens already issued stay valid until they expire (15 minutes).
- `/auth/setup`, `/auth/login` and `/auth/password` share one rate limit: 10 requests per client IP per 15 minutes, then 429 `TOO_MANY_REQUESTS` with a `Retry-After` header. Add `middleware: [rateLimit('auth')]` to any new route that checks a password.

## Content model

| Table                | From       | Notes                                                                                                               |
| -------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------- |
| `users`, `sessions`  | `kiln-cms` | Admin accounts and their refresh tokens                                                                             |
| `rate_limits`        | `kiln-cms` | One counter row per limiter and client IP, hard-deleted when its window ends                                        |
| `categories`, `tags` | this app   | Taxonomies, addressed by slug in public routes                                                                      |
| `posts`              | this app   | `status` is `draft` or `published`. `content` is an opaque JSON document from the editor; the API never inspects it |
| `post_tags`          | this app   | Join table                                                                                                          |
| `revisions`          | this app   | One snapshot per publish, newest 10 kept per post, restorable                                                       |
| `media`              | this app   | Metadata for stored files (R2 or a folder), served at `/files/<key>`                                                |

## Finishing a task

1. `pnpm check` passes.
2. New endpoints appear correctly in `/openapi.json`.
3. New behaviour has a test in `test/`.
