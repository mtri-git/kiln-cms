# Remove a module

Removes a resource you do not need. Example: the template's `tags`. Read `AGENTS.md` first.

## Steps

1. Find what depends on the module. Other modules may import its service or schemas, and other tables may
   reference its table:

   ```sh
   grep -rn "tags" src --include=*.ts
   ```

   In the template, `posts` uses `tags` (the `post_tags` table, `tagIds` in the schemas, `withRelations` in the
   service). Remove that use first, or keep the module.

2. Delete the module folder, its table and its test:

   ```
   src/modules/tags/
   src/db/schema/tags.ts
   test/tags.test.ts
   ```

3. Remove its line from `src/db/schema/index.ts` (`export * from './tags'`).

4. Remove its imports and its `.route(...)` lines from `src/routes.ts`.

5. Remove any `onChange` handler in `src/hooks.ts` that checks `event.resource === 'tags'`.

6. Generate the migration:

   ```sh
   pnpm db:generate
   ```

   It drops the table. Read it before you apply it: the rows are gone for good. Back up the database first if they
   might matter (`wrangler d1 export` on Cloudflare, a copy of `data/kiln.db` with the server stopped on Node.js
   and Bun).

7. Apply it: `pnpm db:migrate:local`, then `pnpm db:migrate:remote` after you deploy (Cloudflare). Node.js and Bun
   apply it at the next start.

8. Run the checks:

   ```sh
   pnpm check
   ```

## Checklist

- [ ] `grep -rn "tags" src test` finds nothing left
- [ ] The migration only drops what you meant to drop
- [ ] `pnpm check` passes
