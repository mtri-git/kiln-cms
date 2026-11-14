# Kiln CMS app

A headless CMS API built on Hono and Drizzle (SQLite). It runs on Cloudflare Workers (D1 + R2), Node.js or Bun (a SQLite file + a folder for files). Frontends are separate projects that call this API.

It is built on the [`kiln-cms`](https://github.com/mtri-git/kiln-cms) package. The package holds the shared code and the login; this folder holds your content modules.

The app itself is in `src/app.ts`. One small entry file per runtime picks where it runs:

| Runtime            | Entry               | Data           | Files         | Settings                      |
| ------------------ | ------------------- | -------------- | ------------- | ----------------------------- |
| Cloudflare Workers | `src/worker.ts`     | D1             | R2            | `wrangler.jsonc`, `.dev.vars` |
| Node.js            | `src/server.ts`     | `data/kiln.db` | `data/files/` | `.env`                        |
| Bun                | `src/server.bun.ts` | `data/kiln.db` | `data/files/` | `.env`                        |

Keep the entries you use and delete the others.

## Quick start

### Cloudflare

```sh
cp .dev.vars.example .dev.vars
pnpm install
pnpm db:migrate:local
pnpm dev
```

### Node.js

```sh
cp .env.example .env
pnpm install
pnpm dev:node
```

### Bun

```sh
cp .env.example .env
bun install
bun run dev:bun
```

On Node.js and Bun, the server applies the migrations itself at startup and creates `data/` when it is missing.

The API runs at http://localhost:8787. Open http://localhost:8787/docs for the reference.

Create the first admin once with `POST /auth/setup`, then log in with `POST /auth/login`.

## Deploy to Cloudflare

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
- `FILES_PUBLIC_URL`: public base URL of the bucket (custom domain). Empty serves files through the Worker at `/files/*`.

## Deploy on a server (Node.js or Bun)

1. Copy the app to the server and install: `pnpm install` (Node.js) or `bun install` (Bun).
2. Create `.env` from `.env.example`. Set `NODE_ENV=production` (also the default when unset), a random `JWT_SECRET` (32 characters or more) and `CORS_ALLOW_LIST`.
3. Start it: `pnpm start:node` or `bun run start:bun`. Keep it running with systemd, pm2 or a container.
4. Create the first admin with `POST /auth/setup`. Do it right away: the route is open until the first user exists.

Notes:

- `data/` holds the database and the files. Put it on a persistent disk and back it up (copy the files while the server is stopped, or use a tool such as Litestream).
- Run one server process: SQLite is a file on one machine.
- Behind a reverse proxy (nginx, Caddy), set `CLIENT_IP_HEADER` to the header the proxy sets (`X-Forwarded-For`, `X-Real-IP`) so the login rate limit counts per client.
- Every other setting is listed in `.env.example`.

## Upgrade

```sh
pnpm update kiln-cms
pnpm db:generate
pnpm check
```

`pnpm db:generate` creates a migration when the new version changed the package's tables (`users`, `sessions`, `rate_limits`). On Cloudflare, apply it with `pnpm db:migrate:local`, and with `pnpm db:migrate:remote` after you deploy. On Node.js and Bun, the server applies it at the next start.

## Common tasks

- `pnpm gen:module <name> [singular]` creates a new module. See [add a module](docs/recipes/add-module.md).
- [Remove a module](docs/recipes/remove-module.md) you do not need.
- [Add a field](docs/recipes/add-field.md) to an existing table.
- [Add an endpoint](docs/recipes/add-endpoint.md) to an existing module.
- [Add a change hook](docs/recipes/add-hook.md) to run code after content changes (purge a cache, call a webhook).
- [Send webhooks](docs/recipes/send-webhooks.md) to other services when content changes (settings only, signed).
- [Call the API](docs/recipes/call-the-api.md) from a frontend.

## Before you finish

```sh
pnpm check
```

This runs the typecheck, the convention check and the tests. The tests run twice: on the Cloudflare adapter and on the Node.js/Bun adapter.

## Docs

- [AGENTS.md](AGENTS.md): the rules and the layout. Read it before changing code.
- [docs/recipes/](docs/recipes/): step-by-step guides.
