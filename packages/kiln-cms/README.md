# kiln-cms

A headless CMS core for Cloudflare Workers: Hono for the API, D1 (Drizzle) for data and R2 for files.

The package holds the shared code: the router and response helpers, errors, middleware, change hooks, login (`/auth`), user management (`/admin/users`) and the `kiln` command-line tool. Your content modules (posts, pages, anything else) live in your own app.

## Start a new site

The quickest way is to copy the starter app from the repository, which already has posts, categories, tags, media and the migrations:

https://github.com/mtri-git/kiln-cms/tree/main/template

Then follow its README.

## Use it in an existing Worker

```sh
pnpm add kiln-cms hono @hono/zod-openapi drizzle-orm zod
```

```ts
// src/worker.ts
import { type AppEnv, createRouter, createWorker, ok } from 'kiln-cms'
import type { OpenAPIHono } from '@hono/zod-openapi'

function registerRoutes(app: OpenAPIHono<AppEnv>) {
  const api = createRouter()
  api.get('/hello', (c) => ok(c, { hello: 'world' }))
  app.route('/api', api)
}

export default createWorker({ title: 'My API', version: '0.1.0', registerRoutes })
```

The Worker needs these bindings in `wrangler.jsonc`:

- `DB`: a D1 database
- `BUCKET`: an R2 bucket
- `JWT_SECRET`: a secret of 32 characters or more
- the `nodejs_compat` compatibility flag

The package's tables (`users`, `sessions`, `rate_limits`) are exported from `kiln-cms/schema`. Re-export them from your Drizzle schema so `drizzle-kit generate` creates their migrations.

`kiln-cms` mounts `/health`, `/auth`, `/admin/users`, `/docs` and `/openapi.json` for you.

## Options of `createWorker`

| Option           | Default        | What it does                                                                                              |
| ---------------- | -------------- | --------------------------------------------------------------------------------------------------------- |
| `registerRoutes` | required       | Mounts your routers on the app                                                                            |
| `registerHooks`  | none           | Registers change hooks with `onChange`                                                                    |
| `title`          | `Kiln CMS API` | Title shown in `/openapi.json` and `/docs`                                                                |
| `version`        | `0.1.0`        | Version shown in `/openapi.json` and `/docs`                                                              |
| `basePath`       | none           | Prefix for the routes `kiln-cms` mounts itself. `'/api'` gives `/api/health`, `/api/auth`, `/api/docs`... |
| `builtInAuth`    | `true`         | `false` leaves out `/auth` and `/admin/users`                                                             |

Use `basePath` when the Worker only receives part of a domain (a route such as `example.com/api/*`). Your own routes are not moved: `registerRoutes` decides where they go.

Use `builtInAuth: false` when your users sign in somewhere else, for example behind Cloudflare Access. Write your own `requireAuth` middleware; it must call `c.set('user', { userId, email, role })`. The `users`, `sessions` and `rate_limits` tables and the `JWT_SECRET` secret are then not needed.

## Your own bindings

`getEnv()` returns the bindings of the current request. Give it your own type when you have bindings `kiln-cms` does not know, such as an R2 bucket under another name than `BUCKET`:

```ts
type MyEnv = { DB: D1Database; MEDIA: R2Bucket; SITE_URL: string }

const bucket = getEnv<MyEnv>().MEDIA
onChange<MyEnv>(async (event, env) => {
  await fetch(`${env.SITE_URL}/revalidate`, { method: 'POST', body: JSON.stringify(event) })
})
```

## Errors

Throw `Errors.NOT_FOUND('Post')`, `Errors.CONFLICT('Slug already exists', { field: 'slug' })`... and the error handler answers `{ success: false, error: { code, message, details }, requestId }`. The optional second argument of `CONFLICT`, `BAD_REQUEST` and `INVALID_INPUT` goes into `details`. A write that breaks a UNIQUE constraint answers 409 `CONFLICT` instead of 500.

## Command-line tool

```sh
kiln gen:module <plural-name> [singular-name]   # create a module from src/modules/categories
kiln check                                      # check the conventions in AGENTS.md
```

## Requirements

Node.js 22.12 or later for the tooling. The code itself runs on Cloudflare Workers.

## License

MIT
