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

`kiln-cms` mounts `/auth`, `/admin/users`, `/docs` and `/openapi.json` for you.

## Command-line tool

```sh
kiln gen:module <plural-name> [singular-name]   # create a module from src/modules/categories
kiln check                                      # check the conventions in AGENTS.md
```

## Requirements

Node.js 22.12 or later for the tooling. The code itself runs on Cloudflare Workers.

## License

MIT
