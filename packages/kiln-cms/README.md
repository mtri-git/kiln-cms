# kiln-cms

A small headless CMS core: Hono for the API, Drizzle on SQLite for data. One app runs on three runtimes:

| Adapter               | Runtime            | Data                   | Files            |
| --------------------- | ------------------ | ---------------------- | ---------------- |
| `kiln-cms/cloudflare` | Cloudflare Workers | D1                     | R2               |
| `kiln-cms/node`       | Node.js 22.12+     | a SQLite file (libSQL) | a folder on disk |
| `kiln-cms/bun`        | Bun                | a SQLite file (libSQL) | a folder on disk |

All three are SQLite, so the schema and the migrations are the same everywhere.

The package holds the shared code: the router and response helpers, errors, middleware, change hooks, login (`/auth`), user management (`/admin/users`) and the `kiln` command-line tool. Your content modules (posts, pages, anything else) live in your own app.

Docs: https://mtri-git.github.io/kiln-cms/

## Start a new site

The quickest way is to copy the starter app from the repository, which already has posts, categories, tags, media, the migrations and an entry for each runtime:

https://github.com/mtri-git/kiln-cms/tree/main/template

Then follow its README.

## Use it in an existing project

```sh
pnpm add kiln-cms hono @hono/zod-openapi drizzle-orm zod
# Node.js or Bun only:
pnpm add @libsql/client @hono/node-server
```

Write the app once:

```ts
// src/app.ts
import type { OpenAPIHono } from '@hono/zod-openapi'
import { type AppEnv, createRouter, type KilnOptions, ok } from 'kiln-cms'

function registerRoutes(app: OpenAPIHono<AppEnv>) {
  const api = createRouter()
  api.get('/hello', (c) => ok(c, { hello: 'world' }))
  app.route('/api', api)
}

export const appOptions: KilnOptions = { title: 'My API', version: '0.1.0', registerRoutes }
```

Then pick the runtime with one small entry file.

### Cloudflare Workers

```ts
// src/worker.ts
import { createWorker } from 'kiln-cms/cloudflare'
import { appOptions } from './app'

export default createWorker(appOptions)
```

The Worker needs, in `wrangler.jsonc`: a D1 database bound as `DB`, an R2 bucket bound as `BUCKET`, the `nodejs_compat` compatibility flag, and the secret `JWT_SECRET` (32 characters or more). Apply migrations with `wrangler d1 migrations apply DB`.

### Node.js

```ts
// src/server.ts
import { serve } from 'kiln-cms/node'
import { appOptions } from './app'

await serve(appOptions)
```

Run it with `tsx src/server.ts` (or build it first). It reads `.env` when the file exists.

### Bun

```ts
// src/server.bun.ts
import { serve } from 'kiln-cms/bun'
import { appOptions } from './app'

await serve(appOptions)
```

Run it with `bun src/server.bun.ts`. Bun reads `.env` itself.

### Settings of the Node.js and Bun servers

`serve(appOptions, config)` takes these options; each one falls back to an env var, then a default.

| Option              | Env var               | Default               | What it does                                                    |
| ------------------- | --------------------- | --------------------- | --------------------------------------------------------------- |
| `port`              | `PORT`                | `8787`                | Port to listen on                                               |
| `hostname`          | `HOST`                | every interface       | Address to listen on                                            |
| `databaseUrl`       | `DATABASE_URL`        | `file:./data/kiln.db` | libSQL URL. A Turso URL works too                               |
| `databaseAuthToken` | `DATABASE_AUTH_TOKEN` | none                  | Token for a remote libSQL server                                |
| `filesDir`          | `FILES_DIR`           | `./data/files`        | Folder of the uploaded files                                    |
| `migrationsFolder`  |                       | `./migrations`        | Applied at startup. `false` skips them                          |
| `clientIpHeader`    | `CLIENT_IP_HEADER`    | none (socket IP)      | Header with the client IP behind a proxy (`X-Forwarded-For`...) |
| `env`               |                       | `process.env`         | What `getEnv()` returns                                         |

Set `clientIpHeader` only behind a proxy that always sets that header. For a list such as `X-Forwarded-For`, the last entry is used: the address your proxy appended. Behind two proxies, use a header the outer one sets alone (`CF-Connecting-IP`, `X-Real-IP`).

The server stops cleanly on SIGINT and SIGTERM: it stops accepting requests, waits for the change hooks, then closes the database.

A SQLite file lives on one machine: run one server process, keep `data/` on a persistent disk and back it up.

### Shared vars

| Var                | What it does                                                                                          |
| ------------------ | ----------------------------------------------------------------------------------------------------- |
| `JWT_SECRET`       | Signs the access tokens. 32 characters or more. Not needed with `builtInAuth: false`                  |
| `CORS_ALLOW_LIST`  | Origins allowed to call the API from a browser, separated by `\|`. `*` allows all                     |
| `FILES_PUBLIC_URL` | Public base URL of the files. Empty serves them through the app at `/files/*`                         |
| `NODE_ENV`         | `production` hides the message of internal errors. Node.js and Bun default to `production` when unset |

The package's tables (`users`, `sessions`, `rate_limits`) are exported from `kiln-cms/schema`. Re-export them from your Drizzle schema so `drizzle-kit generate` creates their migrations.

`kiln-cms` mounts `/health`, `/auth`, `/admin/users`, `/docs` and `/openapi.json` for you.

## Options

| Option           | Default        | What it does                                                                                              |
| ---------------- | -------------- | --------------------------------------------------------------------------------------------------------- |
| `registerRoutes` | required       | Mounts your routers on the app                                                                            |
| `registerHooks`  | none           | Registers change hooks with `onChange`                                                                    |
| `title`          | `Kiln CMS API` | Title shown in `/openapi.json` and `/docs`                                                                |
| `version`        | `0.1.0`        | Version shown in `/openapi.json` and `/docs`                                                              |
| `basePath`       | none           | Prefix for the routes `kiln-cms` mounts itself. `'/api'` gives `/api/health`, `/api/auth`, `/api/docs`... |
| `builtInAuth`    | `true`         | `false` leaves out `/auth` and `/admin/users`                                                             |

Use `basePath` when the app only receives part of a domain (a route such as `example.com/api/*`). Your own routes are not moved: `registerRoutes` decides where they go.

Use `builtInAuth: false` when your users sign in somewhere else, for example behind Cloudflare Access. Write your own `requireAuth` middleware; it must call `c.set('user', { userId, email, role })`. The `users`, `sessions` and `rate_limits` tables and the `JWT_SECRET` secret are then not needed.

## Files

`getStorage()` returns the file storage of the runtime (R2 or a folder), with the same API everywhere:

```ts
const storage = getStorage()
await storage.put(key, await file.arrayBuffer(), { contentType: file.type })
const stored = await storage.get(key) // { body, contentType, size, etag } or null
await storage.delete(key)
```

## Your own vars

`getEnv()` returns the vars, secrets and bindings of the current request. Give it your own type when you have some `kiln-cms` does not know:

```ts
type MyEnv = { SITE_URL: string }

const site = getEnv<MyEnv>().SITE_URL
onChange<MyEnv>(async (event, env) => {
  await fetch(`${env.SITE_URL}/revalidate`, { method: 'POST', body: JSON.stringify(event) })
})
```

On Cloudflare, Worker bindings (`KVNamespace`, another R2 bucket...) are read the same way. On Node.js and Bun, `getEnv()` is `process.env`.

## Errors

Throw `Errors.NOT_FOUND('Post')`, `Errors.CONFLICT('Slug already exists', { field: 'slug' })`... and the error handler answers `{ success: false, error: { code, message, details }, requestId }`. The optional second argument of `CONFLICT`, `BAD_REQUEST` and `INVALID_INPUT` goes into `details`. A write that breaks a UNIQUE constraint answers 409 `CONFLICT` instead of 500.

## Another runtime

`createHandler(appOptions)` returns `(request, context) => Promise<Response>`. The adapters are thin wrappers around it: they give each request `{ env, db, storage, clientIp, waitUntil }`. Use it to run kiln-cms somewhere the adapters do not cover.

## Upgrade from 0.2

- `createWorker` moved: `import { createWorker } from 'kiln-cms/cloudflare'`.
- `WorkerEnv` moved to `kiln-cms/cloudflare`. The runtime-neutral type is `KilnEnv`.
- Files go through `getStorage()` instead of `getEnv().BUCKET`. `getFile` returns `{ body, contentType, size, etag }`.
- `R2_PUBLIC_URL` is now `FILES_PUBLIC_URL`. The old name is still read.

## Command-line tool

```sh
kiln gen:module <plural-name> [singular-name] [--dry-run]   # create a module and its test
kiln check                                      # check the conventions in AGENTS.md
```

## Requirements

Node.js 22.12 or later for the tooling and the Node.js adapter, Bun for the Bun adapter, or Cloudflare Workers.

## License

MIT
