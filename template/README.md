# Kiln CMS app

A headless CMS API that runs on Cloudflare: one Worker (Hono), D1 (Drizzle) for data and R2 for files. Frontends are separate projects that call this API.

It is built on the [`kiln-cms`](https://github.com/mtri-git/kiln-cms) package. The package holds the shared code and the login; this folder holds your content modules.

## Quick start

```sh
cp .dev.vars.example .dev.vars
pnpm install
pnpm db:migrate:local
pnpm dev
```

The API runs at http://localhost:8787. Open http://localhost:8787/docs for the reference.

Create the first admin once with `POST /auth/setup`, then log in with `POST /auth/login`.

## Deploy

You need a Cloudflare account and `pnpm wrangler login`.

1. Set the name of the Worker, the database and the bucket in `wrangler.jsonc` (default: `kiln-cms`).
2. Deploy. The first deploy creates the D1 database and the R2 bucket:

   ```sh
   pnpm run deploy
   ```

3. Set the JWT secret (32 characters or more, random):

   ```sh
   pnpm wrangler secret put JWT_SECRET
   ```

4. Create the tables. Run this again after every deploy that adds a migration:

   ```sh
   pnpm db:migrate:remote
   ```

5. Create the first admin with `POST /auth/setup` on the deployed URL. Do it right away: the route is open until the first user exists.

Settings in `wrangler.jsonc` under `vars`:

- `CORS_ALLOW_LIST`: origins allowed to call the API from a browser, separated by a vertical bar. The default `*` allows every origin; list your frontends in production.
- `R2_PUBLIC_URL`: public base URL of the bucket (custom domain). Empty serves files through the Worker at `/files/*`.

## Upgrade

```sh
pnpm update kiln-cms
pnpm db:generate
pnpm check
```

`pnpm db:generate` creates a migration when the new version changed the package's tables (`users`, `sessions`, `rate_limits`). Apply it with `pnpm db:migrate:local`, and with `pnpm db:migrate:remote` after you deploy.

## Common tasks

- `pnpm gen:module <name> [singular]` creates a new module. See [add a module](docs/recipes/add-module.md).
- [Add a field](docs/recipes/add-field.md) to an existing table.
- [Add an endpoint](docs/recipes/add-endpoint.md) to an existing module.
- [Add a change hook](docs/recipes/add-hook.md) to run code after content changes (purge a cache, call a webhook).
- [Call the API](docs/recipes/call-the-api.md) from a frontend.

## Before you finish

```sh
pnpm check
```

This runs the typecheck, the convention check and the tests.

## Docs

- [AGENTS.md](AGENTS.md): the rules and the layout. Read it before changing code.
- [docs/recipes/](docs/recipes/): step-by-step guides.
