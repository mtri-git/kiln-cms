# Add a change hook

Runs your code after content changes: purge a cache, call a webhook, rebuild a static site.
Read `AGENTS.md` first.

## How it works

Every service calls `emitChange(resource, action, id)` after a write has succeeded. Each handler registered with `onChange` then receives one event:

```ts
type ChangeEvent = {
  resource: string // module name: 'posts', 'categories', 'tags', 'media'
  action: 'created' | 'updated' | 'deleted' | 'published' | 'unpublished'
  id: string // id of the row
}
```

Handlers run after the response is sent. A handler that throws is logged (`type: "hook_error"`) and changes nothing else: the write is already saved and the other handlers still run.

## Steps

1. Register the handler in `src/hooks.ts`, inside `registerHooks`. `onChange` and `getEnv` come from `kiln-cms`:

   ```ts
   export function registerHooks(): void {
     onChange(async (event) => {
       if (event.resource !== 'posts') return
       await fetch(getEnv<MyEnv>().REVALIDATE_URL, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify(event),
       })
     })
   }
   ```

2. If the handler reads a new var or secret, add it to `wrangler.jsonc` (vars) or `wrangler secret put` (secrets) on Cloudflare, or to `.env` on Node.js and Bun, and declare it in a type of your own: `type MyEnv = KilnEnv & { REVALIDATE_URL: string }`. Read it in the handler with `getEnv<MyEnv>()`.

3. To load the changed row, call its service inside the handler, for example `postsService.getById(event.id)`. A `deleted` event has no row left to load.

4. Add a test under `test/`. `test/hooks.test.ts` shows the pattern: register with `onChange`, send a request with `api(...)`, assert, then call the function `onChange` returned to remove the handler.

5. Run the checks:

   ```sh
   pnpm check
   ```

## Emit from a new write

Modules created with `pnpm gen:module` already emit `created`, `updated` and `deleted`. When you add another write method to a service, emit after the database call succeeds:

```ts
await db.update(authors).set({ isFeatured: true }).where(eq(authors.id, id))
emitChange('authors', 'updated', id)
```

## Notes

- Hooks run after the write. They cannot reject or change it: put validation in the service.
- On Cloudflare, a handler has the time `waitUntil` work is allowed (about 30 seconds after the response). On Node.js and Bun, the server waits for running handlers before it stops. Keep it to one or two outbound calls.
- `users` and `auth` do not emit events.
