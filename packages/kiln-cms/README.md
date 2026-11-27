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
| `globals`        | none           | Single documents by name: `{ settings: { schema } }`. See [Globals](#globals)                             |

Use `basePath` when the app only receives part of a domain (a route such as `example.com/api/*`). Your own routes are not moved: `registerRoutes` decides where they go.

Use `builtInAuth: false` when your users sign in somewhere else, for example behind Cloudflare Access. Write your own `requireAuth` middleware; it must call `c.set('user', { userId, email, role })`. The `users`, `sessions` and `rate_limits` tables and the `JWT_SECRET` secret are then not needed.

## Globals

A global is one document with a name: site settings, a footer text, a banner. Declare each one with a zod schema:

```ts
import { z } from '@hono/zod-openapi'

export const appOptions: KilnOptions = {
  registerRoutes,
  globals: {
    settings: { schema: z.object({ tagline: z.string(), bannerText: z.string().nullable() }) },
    secrets: { schema: z.object({ analyticsId: z.string() }), public: false },
  },
}
```

| Route                       | Who             | What                                                                |
| --------------------------- | --------------- | ------------------------------------------------------------------- |
| `GET /api/globals/{name}`   | anyone          | `{ name, data, updatedAt }`. Left out with `public: false`          |
| `GET /admin/globals/{name}` | signed-in users | The same                                                            |
| `PUT /admin/globals/{name}` | signed-in users | Replaces `data`, validated with the schema. Emits `globals.updated` |

`data` and `updatedAt` are `null` until the first save. The routes move with `basePath`. They are stored in the `globals` table of `kiln-cms/schema`: run `pnpm db:generate` after upgrading to create it. Names are lowercase letters, digits and dashes.

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

## Webhooks

Set `WEBHOOK_URLS` (URLs separated by `|`) and every content change is sent as a `POST` with a JSON body
`{ event: 'posts.published', resource, action, id, occurredAt }`, after the response. `WEBHOOK_SECRET` signs each
request: `X-Kiln-Signature: sha256=<hex HMAC-SHA256 of "<X-Kiln-Timestamp>.<body>">`. `WEBHOOK_EVENTS` keeps only some
events (`posts.published|posts.*|*.deleted`). Failed deliveries (network, 408, 429, 5xx) are tried 3 times with the same
`X-Kiln-Delivery` id. Receivers check a request with `verifyWebhook({ secret, body, timestamp, signature })`.
See [send webhooks](https://github.com/mtri-git/kiln-cms/blob/main/template/docs/recipes/send-webhooks.md).

## Errors

Throw `Errors.NOT_FOUND('Post')`, `Errors.CONFLICT('Slug already exists', { field: 'slug' })`... and the error handler answers `{ success: false, error: { code, message, details }, requestId }`. The optional second argument of `CONFLICT`, `BAD_REQUEST` and `INVALID_INPUT` goes into `details`. A write that breaks a UNIQUE constraint answers 409 `CONFLICT` instead of 500.

## Another runtime

`createHandler(appOptions)` returns `(request, context) => Promise<Response>`. The adapters are thin wrappers around it: they give each request `{ env, db, storage, clientIp, waitUntil }`. Use it to run kiln-cms somewhere the adapters do not cover.

## Upgrade from 0.2

- `createWorker` moved: `import { createWorker } from 'kiln-cms/cloudflare'`.
- `WorkerEnv` moved to `kiln-cms/cloudflare`. The runtime-neutral type is `KilnEnv`.
- Files go through `getStorage()` instead of `getEnv().BUCKET`. `getFile` returns `{ body, contentType, size, etag }`.
- `R2_PUBLIC_URL` is now `FILES_PUBLIC_URL`. The old name is still read.

## Admin UI (optional)

`kiln-cms/admin` is a ready-made admin for the API your app already has. You describe your resources in code and it renders the sign-in page, the lists, the forms, the media library and a rich text editor. The server needs no change: it talks to `/auth` and `/admin/*`.

It is a separate entry of this package. A headless app never imports it, so nothing of it reaches your Worker or server. Its libraries are optional peer dependencies, which you install only when you use it:

```sh
pnpm add react react-dom @base-ui/react @tanstack/react-query lucide-react cheese-editor lowlight
```

```tsx
import { AdminApp, defineResource, usersResource } from 'kiln-cms/admin'
import 'kiln-cms/admin/styles.css'
import { createRoot } from 'react-dom/client'

const posts = defineResource({
  name: 'posts',
  label: 'Posts',
  path: '/admin/posts',
  titleField: 'title',
  columns: ['title', { name: 'status', type: 'badge' }, 'updatedAt'],
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'content', type: 'richtext', format: 'json' },
    { name: 'slug', type: 'slug', from: 'title', required: true, position: 'sidebar' },
    { name: 'coverImageUrl', label: 'Cover image', type: 'image', position: 'sidebar' },
  ],
  actions: [{ label: 'Publish', path: '/{id}/publish', when: (post) => post.status !== 'published' }],
})

createRoot(document.getElementById('root')!).render(
  <AdminApp apiUrl="https://api.example.com" resources={[posts, usersResource]} />,
)
```

The admin is a single-page app with hash routes (`#/posts/123`): it works on any static host. It needs React 19. Step by step, see [Add an admin UI](https://github.com/mtri-git/kiln-cms/blob/main/template/docs/recipes/add-admin-ui.md).

### Resources

| Key                      | Meaning                                                                                  |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| `name`, `label`, `group` | URL segment, menu text, menu heading                                                     |
| `path`                   | API path of the admin routes, e.g. `/admin/posts`                                        |
| `titleField`             | Field that names a record (page title, relation options)                                 |
| `columns`                | Names, or `{ name, label, type, render }`. `name` can be a path: `category.name`         |
| `filters`                | `{ name, label, options }`: sent as a query parameter to the list endpoint               |
| `actions`                | Buttons that call `POST {path}/{id}/...`, e.g. publish. Disabled while the form is dirty |
| `fields`                 | See below                                                                                |
| `canCreate`, `canDelete` | `false` hides the button                                                                 |

| Field `type` | Stores                        | Options                                                                        |
| ------------ | ----------------------------- | ------------------------------------------------------------------------------ |
| `text`       | string                        | `inputType` (`text`, `email`, `password`, `url`), `maxLength`                  |
| `textarea`   | string                        | `rows`, `maxLength`                                                            |
| `number`     | number                        | `integer`                                                                      |
| `boolean`    | boolean                       |                                                                                |
| `select`     | string                        | `options: [{ value, label }]`                                                  |
| `slug`       | string                        | `from`: the field it follows until you edit it. Strips accents (`đ` → `d`)     |
| `image`      | URL string                    | Picks from the media library                                                   |
| `media`      | media id                      | Picks from the media library. Reads `{ id, ... }` from a record as the id      |
| `richtext`   | JSON object or HTML string    | `format: 'json'` (default) or `'html'`                                         |
| `relation`   | id, or `id[]` with `multiple` | `resource`: the `name` of another resource. Searches it with its `searchParam` |

Every field also takes `label`, `description`, `placeholder`, `required`, `position` (`main` or `sidebar`), `mode` (`create` or `edit` only), `readOnly`, `readOnlyOnEdit`, `omitIfEmpty` and `read(record)` (when the form value is not `record[name]`, e.g. `tagIds` from `record.tags`).

### Globals

`defineGlobal({ name, label, path, fields, group })` describes a global of the API (see [Globals](#globals)) for the admin. Pass them as `globals` to `AdminApp`: each gets a menu entry (under `Settings` by default) and a form at `#/globals/{name}`. The form takes the same field types as a resource. Saving sends the whole document with `PUT path`, keeping the keys the form does not show.

```tsx
const settings = defineGlobal({
  name: 'settings',
  label: 'Site settings',
  path: '/admin/globals/settings',
  fields: [{ name: 'tagline', type: 'text', required: true }],
})

<AdminApp resources={[posts]} globals={[settings]} />
```

### Rich text

A `richtext` field uses [cheese-editor](https://github.com/mtri-git/cheese-editor): a toolbar, a slash menu (type `/`), a bubble menu when you select text, headings 1 to 4, lists and task lists, tables, callouts, collapsible blocks, video (YouTube, Vimeo, mp4), raw HTML blocks, code blocks with highlighting, links and images. Links have no `nofollow`; "Open in new tab" adds `target="_blank" rel="noopener noreferrer"`. Images you paste, drop or pick from your disk are uploaded to `/admin/media`; "Image from library" inserts one that is already there.

`format` decides what the field stores:

- `json` (default): the document, as an object. Safe to store and easy to migrate.
- `html`: a string such as `<p><strong>Hi</strong></p>`. The API stores whatever it is sent, so sanitize it before you show it in a page.

Kiln's `content` columns hold any JSON value, so both work without a server change. Either kind of content opens in the editor, so you can change a field's `format` and old content still loads. It is saved in the new format the next time someone saves.

To show the content in a page, use `cheese-editor/render`: it needs no React and no Tiptap, so it runs on a Worker too.

```ts
import { renderContent } from 'cheese-editor/render'
import 'cheese-editor/prose.css' // styles for the rendered content (class `ce-prose`)

const html = renderContent(post.content) // JSON is rendered safely; an HTML string needs a `sanitize` option
```

An HTML block is output as it was written, so it is left out unless you allow it: `renderContent(post.content, { rawHtml: true })` when you trust the people who edit content, or `rawHtml: (html) => DOMPurify.sanitize(html)`. To import HTML the editor has no node for (an embed widget, a styled table), wrap it in `<div data-type="html-block">…</div>`: it opens as an HTML block and is kept as it is.

`RichTextEditor` is exported if you want the editor outside a resource form.

### Theme

The CSS is compiled and scoped to `.kiln-admin`, and it includes the editor's: import only `kiln-cms/admin/styles.css`. Importing `cheese-editor/styles.css` again, outside a layer, overrides the editor colours and leaves it light in dark mode.

The menu has a theme switch (system, light, dark) and a button that collapses it to icons on wide screens. Both choices are kept per browser in `localStorage` (`<storageKey>:theme`, `<storageKey>:nav`). Set `theme="light" | "dark"` on `<AdminApp>` to force a theme and hide the switch. Give a resource or global an `icon` (e.g. a lucide icon at `size-4`) to show it in the collapsed menu; without one it shows the first letter of the label.

Re-skin it with CSS variables:

```css
.kiln-admin {
  --k-accent: #0f766e;
  --k-accent-ink: #fff;
}
```

Variables: `--k-canvas`, `--k-surface`, `--k-subtle`, `--k-ink`, `--k-muted`, `--k-line`, `--k-accent`, `--k-accent-ink`, `--k-danger`, `--k-ok`, `--k-font`.

### Session

Tokens are kept in `localStorage` (key `kiln-admin`, change it with `storageKey`). The access token is refreshed on a `401`. If the refresh fails, the admin returns to the sign-in page. The sign-in page can also create the first administrator while the users table is empty (`POST /auth/setup`).

Not there yet: bulk actions, sorting by column, revision history, and translations of the interface.

## Command-line tool

```sh
kiln gen:module <plural-name> [singular-name] [--dry-run]   # create a module and its test
kiln check                                      # check the conventions in AGENTS.md
```

## Requirements

Node.js 22.12 or later for the tooling and the Node.js adapter, Bun for the Bun adapter, or Cloudflare Workers.

## License

MIT
