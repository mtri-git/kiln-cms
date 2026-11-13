# Tests

`pnpm test` runs vitest in Node, twice: once per adapter (two vitest projects, see `vitest.config.ts`).

- `cloudflare`: each test file gets its own in-memory D1 + R2 (wrangler `getPlatformProxy`, `persist: false`).
- `node`: each test file gets its own SQLite file (libSQL) and files folder in a temp dir. Bun uses the same code.

Tests send real `Request`s through the app (`src/app.ts`). No dev server, no migrations. Run one adapter with
`pnpm test --project node`.

Tables are created from `src/db/schema/index.ts` (see `global-setup.ts`). Export a new table there and it
exists in tests automatically.

## Helpers (`import { api, tokenFor, resetDb } from './helpers'`)

- `api(path, { method?, body?, token?, headers? })` returns `{ status, json, res }`. Method defaults to
  POST when `body` is given, else GET.
- `tokenFor('admin' | 'editor', { userId?, email? })` returns a valid access token (no users table needed).
- `resetDb()` empties every table. Call it in `beforeEach`.
- `execute(sql, args?)` runs raw SQL and returns the rows. `storage` is the file storage under test.
- `fetchApp(request)` sends any `Request` (a form upload...). `buildApp(options)` builds a one-off app.

Envelope: success is `{ success: true, data, requestId }` (lists add `pagination`); errors are
`{ success: false, error: { code, message, details? }, requestId }`.

## Example: `test/tags.test.ts`

```ts
import { beforeEach, expect, it } from 'vitest'
import { api, resetDb, tokenFor } from './helpers'

beforeEach(resetDb)

it('creates a tag and lists it publicly', async () => {
  const token = await tokenFor('admin')
  const created = await api('/admin/tags', { body: { name: 'News', slug: 'news' }, token })
  expect(created.status).toBe(201)
  const list = await api('/api/tags')
  expect(list.json.data).toHaveLength(1)
})
```

Copy `categories.test.ts` for the full set of cases (401, 400, 404, 409, patch, delete). Role-restricted
routes: test with `tokenFor('editor')` and expect 403.
