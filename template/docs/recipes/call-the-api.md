# Call the API from a frontend

For frontend authors. The API is a JSON API. Local base URL: `http://localhost:8787`. Production: the URL that `pnpm run deploy` prints (Cloudflare), or the address of your server (Node.js, Bun).

## Steps

1. Pick the base path:

   | Prefix       | Auth                                  | Use for                                |
   | ------------ | ------------------------------------- | -------------------------------------- |
   | `/api/...`   | none                                  | Public, read-only content (`GET` only) |
   | `/admin/...` | `Authorization: Bearer <accessToken>` | Create, update, delete                 |
   | `/auth/...`  | see step 4                            | Login, refresh, logout, `me`           |

   Example: `GET /api/categories` (public) and `POST /admin/categories` (admin).

2. Read the envelope. Every response has `success` and `requestId`:

   ```json
   { "success": true, "data": { "id": "...", "name": "News" }, "requestId": "..." }
   ```

   A list adds `pagination`:

   ```json
   {
     "success": true,
     "data": [],
     "pagination": { "total": 42, "page": 1, "limit": 20, "totalPages": 3, "hasMore": true },
     "requestId": "..."
   }
   ```

   An error has `success: false` and an `error` object. Use `error.code` to branch and `error.message` to show:

   ```json
   { "success": false, "error": { "code": "NOT_FOUND", "message": "Category not found" }, "requestId": "..." }
   ```

   Validation errors (HTTP 400) use `code: "VALIDATION_ERROR"` and list the problems in `error.details`.

3. Page through lists with query parameters. `page` starts at 1, `limit` defaults to 20 and is capped at 100:

   ```sh
   curl -s "http://localhost:8787/api/categories?page=2&limit=10"
   ```

   Read `pagination.hasMore` to know whether to request the next page.

4. Log in and keep the tokens. Create the first admin once with `POST /auth/setup` (only works while there are no users). Then log in:

   ```sh
   curl -s -X POST http://localhost:8787/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"admin@example.com","password":"..."}'
   ```

   `data` contains `user`, `accessToken` and `refreshToken`. The access token lasts 15 minutes. The refresh token is opaque; the server stores only its hash.

5. Call admin routes with the access token:

   ```sh
   curl -s -X POST http://localhost:8787/admin/categories \
     -H "Authorization: Bearer $ACCESS_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"name":"News","slug":"news"}'
   ```

6. Refresh when the access token expires. Send the refresh token to `POST /auth/refresh`. It returns a new `accessToken` and a new `refreshToken`. The old refresh token stops working, so store the new one:

   ```ts
   const BASE = 'http://localhost:8787'

   async function refreshTokens(refreshToken: string) {
     const res = await fetch(`${BASE}/auth/refresh`, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ refreshToken }),
     })
     const body = await res.json()
     if (!body.success) throw new Error(body.error.message) // log the user out
     return body.data as { accessToken: string; refreshToken: string }
   }
   ```

   Retry the failed admin request once with the new access token. If refresh fails, send the user to the login screen.

7. Log out with `POST /auth/logout` and body `{ "refreshToken": "..." }`. It deletes that session.

   To change the signed-in user's password, send `POST /auth/password` with the access token and body `{ "currentPassword": "...", "newPassword": "..." }`. It signs the user out everywhere and returns a new `accessToken` and `refreshToken`: store them in place of the old ones.

8. Read the API description. The OpenAPI document is at http://localhost:8787/openapi.json, and the interactive reference is at http://localhost:8787/docs. Generate typed clients from `openapi.json` if you want them.

## Notes

- Browser calls need the page's origin in `CORS_ALLOW_LIST` (`wrangler.jsonc` on Cloudflare, `.env` on Node.js and Bun). The default is `*`.
- Dates in responses are ISO strings (`"2026-01-01T00:00:00.000Z"`).
- Send the `requestId` from a failed response when you report a bug.
- `/auth/setup`, `/auth/login` and `/auth/password` allow 10 requests per IP per 15 minutes. After that they answer 429 with `code: "TOO_MANY_REQUESTS"`; wait the number of seconds in the `Retry-After` header before trying again.
