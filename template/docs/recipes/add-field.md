# Add a field to an existing table

Adds one column to a table and exposes it in the API. Example: add `featured` to `categories`.
Migrations only add: never drop or rename a column that holds data.

## Steps

1. Add the column in the schema file `src/db/schema/categories.ts`. A new column on a table with rows must be nullable or have a default, because SQLite rejects `NOT NULL` without one:

   ```ts
   featured: integer('featured', { mode: 'boolean' }).notNull().default(false),
   ```

2. Export it in the types you need. The `Category` and `NewCategory` types are inferred, so they update on their own.

3. Expose it in `src/modules/categories/categories.schemas.ts`. Response schema:

   ```ts
   export const categorySchema = z
     .object({
       ...baseFields,
       name: z.string(),
       // ...existing fields
       featured: z.boolean(),
       ...seoFields,
     })
     .openapi('Category')
   ```

   Request schema (optional on create, so it is also optional on update through `.partial()`):

   ```ts
   export const createCategorySchema = z
     .object({
       name: z.string().min(1).max(255),
       // ...existing fields
       featured: z.boolean().optional(),
       metaTitle: seoFields.metaTitle.optional(),
     })
     .openapi('CreateCategory')
   ```

4. Check `src/modules/categories/categories.service.ts`. `create` and `update` pass the whole input to Drizzle, so a new key is saved with no change. Edit the service only when the field needs a rule, such as a filter in `list`:

   ```ts
   const where = and(notDeleted(categories), input.featured ? eq(categories.featured, true) : undefined)
   ```

5. Generate the migration and apply it locally:

   ```sh
   pnpm db:generate
   pnpm db:migrate:local
   ```

   Open the new file in `migrations/` and confirm it only contains `ALTER TABLE ... ADD COLUMN`.

6. Add a test under `test/` that creates a category with `featured: true` and reads it back.

7. Test it against the running API. Start the server, log in and call the endpoint (see `call-the-api.md` for the token):

   ```sh
   pnpm dev
   ```

   ```sh
   curl -s -X POST http://localhost:8787/admin/categories \
     -H "Authorization: Bearer $ACCESS_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"name":"News","slug":"news","featured":true}'
   ```

   The response `data` must contain `"featured": true`.

8. Run the checks:

   ```sh
   pnpm check
   ```

## Notes

- Existing rows get the default (`false` here). Backfill with a service call or a one-off script if the old rows need another value.
- Do not edit the SQL in `migrations/` by hand. Change the schema file and run `pnpm db:generate` again.
