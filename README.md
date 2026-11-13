# Kiln CMS

A headless CMS for Cloudflare: one Worker (Hono), D1 (Drizzle) for data and R2 for files. Frontends are separate projects that call the API.

Kiln has two parts:

| Folder               | What it is                                                                                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/kiln-cms/` | The `kiln-cms` npm package: router and response helpers, errors, middleware, change hooks, login (`auth`), `users`, and the `kiln` command-line tool |
| `template/`          | A starter app built on the package: posts, categories, tags, media, the route map and the migrations. You copy this folder and make it your own      |

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

The tests for the package live in `template/test/`: they send real requests through the template's Worker.

## Scope

Kiln stays small on purpose. It does not have, and does not plan:

- an admin UI (each site brings its own; the API is described at `/openapi.json`)
- content types created at runtime (add a table with `pnpm gen:module`, then deploy)
- runtime plugins (extend with modules and change hooks)
- hosting outside Cloudflare

## Docs

- [template/AGENTS.md](template/AGENTS.md): the rules and the layout of an app.
- [template/docs/recipes/](template/docs/recipes/): step-by-step guides.

## License

MIT
