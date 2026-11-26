<img src="site/logo.svg" alt="Kiln CMS logo" width="80">

# Kiln CMS

Guide: https://mtri-git.github.io/kiln-cms/

A small headless CMS on Hono and Drizzle (SQLite). One app runs on Cloudflare Workers (D1 for data, R2 for files), Node.js or Bun (a SQLite file and a folder for files). Frontends are separate projects that call the API.

Kiln has two parts:

| Folder               | What it is                                                                                                                                                                                   |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/kiln-cms/` | The `kiln-cms` npm package: router and response helpers, errors, middleware, change hooks, login (`auth`), `users`, the adapters, the `kiln` CLI and an optional admin UI (`kiln-cms/admin`) |
| `template/`          | A starter app built on the package: posts, categories, tags, media, the route map, the migrations and one entry per runtime. You copy it and make it your own                                |

You edit the app freely. You upgrade the package with `pnpm update kiln-cms`.

## Start a new site

Copy `template/` into a new repo, then follow [template/README.md](template/README.md). It installs [`kiln-cms`](https://www.npmjs.com/package/kiln-cms) from npm.

## Work on Kiln itself

```sh
pnpm install
cp template/.dev.vars.example template/.dev.vars
pnpm build
pnpm --filter kiln-app db:migrate:local
pnpm dev
```

`pnpm dev` builds the package, then runs the template at http://localhost:8787 (`/docs` shows the API).
The template uses the built package (`packages/kiln-cms/dist`): run `pnpm build` again after changing the package.

Before you finish:

```sh
pnpm check
```

This runs the linter (Biome), builds the package, typechecks it, then runs the template's typecheck, convention check and tests. `pnpm lint:fix` formats the code.

The tests for the package live in `template/test/`: they send real requests through the template's app, once on the Cloudflare adapter and once on the Node.js/Bun adapter.

## Scope

Kiln stays small on purpose. It does not have, and does not plan:

- an admin UI built into the API: `kiln-cms/admin` is a separate, optional entry that headless apps never load (see [Add an admin UI](template/docs/recipes/add-admin-ui.md)); the API stays headless and is described at `/openapi.json`
- content types created at runtime (add a table with `pnpm gen:module`, then deploy)
- runtime plugins (extend with modules and change hooks)
- databases other than SQLite (D1 on Cloudflare, libSQL on Node.js and Bun)

## Docs

- [template/AGENTS.md](template/AGENTS.md): the rules and the layout of an app.
- [template/docs/recipes/](template/docs/recipes/): step-by-step guides.

## License

MIT
