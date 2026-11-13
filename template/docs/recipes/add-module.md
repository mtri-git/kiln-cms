# Add a module

Adds a new resource (a table, its Zod schemas, a service, public and admin routes). Example: `authors`.
Read `AGENTS.md` first. The reference module is `src/modules/categories/`.

## Steps

1. Generate the files from the reference module. Use the plural name in kebab-case. Pass the singular when the default rule gets it wrong (for example `post-series post-series`):

   ```sh
   pnpm gen:module authors
   # or, for irregular names:
   pnpm gen:module post-series post-series
   ```

   This creates:

   ```
   src/db/schema/authors.ts
   src/modules/authors/authors.schemas.ts
   src/modules/authors/authors.service.ts
   src/modules/authors/authors.home-routes.ts
   src/modules/authors/authors.admin-routes.ts
   ```

   It also adds one line to `src/db/schema/index.ts` and four lines to `src/routes.ts`. It refuses to run if the module or schema file already exists.

2. Set the columns in `src/db/schema/authors.ts`. Keep `...baseColumns`. Add `...seoColumns` only for content tables:

   ```ts
   export const authors = sqliteTable(
     'authors',
     {
       ...baseColumns,
       name: text('name').notNull(),
       slug: text('slug').notNull().unique(),
       bio: text('bio'),
       ...seoColumns,
     },
     (table) => [index('idx_authors_name').on(table.name)],
   )
   ```

3. Make the Zod schemas in `src/modules/authors/authors.schemas.ts` match those columns. The response schema describes JSON: dates are `timestamp`, not `z.date()`:

   ```ts
   export const authorSchema = z
     .object({
       ...baseFields,
       name: z.string(),
       slug: z.string(),
       bio: z.string().nullable(),
       ...seoFields,
     })
     .openapi('Author')
   ```

   Update `createAuthorSchema` the same way (optional fields use `.optional()`).

4. Change `src/modules/authors/authors.service.ts` only where the rules differ from categories (slug checks, default ordering). Every database call lives here and throws `Errors.X()`.

5. Delete a routes file you do not need, together with its import and `.route(...)` line in `src/routes.ts`. A module without public routes omits `home-routes`. `check-conventions` requires at least one routes file.

6. Generate the migration and apply it locally:

   ```sh
   pnpm db:generate
   pnpm db:migrate:local
   ```

7. Add a test under `test/` for the new behaviour (AGENTS.md requires one).

8. Run the checks:

   ```sh
   pnpm check
   ```

9. Start the API and confirm the endpoints in the docs:

   ```sh
   pnpm dev
   ```

   Open http://localhost:8787/docs, or check http://localhost:8787/openapi.json for the `Authors - Public` and `Authors - Admin` tags.

## Checklist

- [ ] No `categor` text left in the new files (`grep -ri categor src/modules/authors src/db/schema/authors.ts`)
- [ ] `pnpm check` passes
- [ ] New endpoints appear in `/openapi.json`
- [ ] The migration in `migrations/` only adds (no drop or rename of a column with data)
