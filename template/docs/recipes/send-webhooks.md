# Send webhooks

Calls other services when content changes: rebuild a static site, purge a CDN, notify Slack through a relay, start an
AI agent's workflow. Webhooks need no code, only settings. For custom logic, write a [change hook](add-hook.md).

## How it works

After each successful write to content, the API sends one `POST` to every URL in `WEBHOOK_URLS`. It runs after the
response is sent: a slow or failing receiver never slows down or fails the request.

Body (JSON):

```json
{
  "event": "posts.published",
  "resource": "posts",
  "action": "published",
  "id": "4f1c...",
  "occurredAt": "2026-11-14T10:00:00.000Z"
}
```

`action` is `created`, `updated`, `deleted`, `published` or `unpublished`. The body carries the id, not the row: load
it from the API (`GET /admin/posts/{id}`, or the public route) if you need it. A `deleted` row is gone.

Headers:

| Header             | Value                                                                          |
| ------------------ | ------------------------------------------------------------------------------ |
| `X-Kiln-Event`     | Same as `event`                                                                |
| `X-Kiln-Delivery`  | Id of this delivery. The same on every retry and every URL: use it to dedupe   |
| `X-Kiln-Timestamp` | Unix time (seconds) of this attempt                                            |
| `X-Kiln-Signature` | `sha256=<hex>`: HMAC-SHA256 of `<timestamp>.<raw body>` with `WEBHOOK_SECRET`. |

A delivery is tried up to 3 times (after 1 s, then 3 s) when the receiver cannot be reached, takes over 8 seconds,
or answers 408, 429 or 5xx. Any other status ends it. A delivery that fails every attempt is logged with
`type: "webhook_failed"`. Nothing is queued: a receiver that is down longer than that misses the event.

## Steps

1. Set the vars. On Node.js and Bun, in `.env`:

   ```sh
   WEBHOOK_URLS=https://example.com/api/revalidate|https://hooks.example.org/kiln
   WEBHOOK_SECRET=a-long-random-string
   WEBHOOK_EVENTS=posts.published|posts.unpublished|posts.deleted
   ```

   On Cloudflare, put `WEBHOOK_URLS` and `WEBHOOK_EVENTS` in `vars` of `wrangler.jsonc` and the secret in a secret:

   ```sh
   pnpm wrangler secret put WEBHOOK_SECRET
   ```

   Locally on Cloudflare, put all three in `.dev.vars`.

2. Choose the events. `WEBHOOK_EVENTS` takes entries separated by `|`: `posts.published` (one event), `posts.*`
   (every action on posts), `*.deleted` (one action on everything). Empty sends every event.

3. Check the signature in the receiver. With `kiln-cms` installed:

   ```ts
   import { verifyWebhook } from 'kiln-cms'

   export async function POST(request: Request) {
     const body = await request.text() // the raw text, before JSON.parse
     const valid = await verifyWebhook({
       secret: process.env.WEBHOOK_SECRET!,
       body,
       timestamp: request.headers.get('X-Kiln-Timestamp'),
       signature: request.headers.get('X-Kiln-Signature'),
     })
     if (!valid) return new Response('Invalid signature', { status: 401 })
     const event = JSON.parse(body)
     // ...
     return new Response('ok')
   }
   ```

   Without it, compute `sha256=` + hex HMAC-SHA256 of `` `${timestamp}.${body}` `` with the secret, compare it to
   `X-Kiln-Signature` in constant time, and reject a timestamp more than 5 minutes old.

4. Answer quickly with a 2xx. Do long work after answering, or the attempt times out and is retried.

## Notes

- Without `WEBHOOK_SECRET` the requests are not signed. Set it in production.
- `users` and `auth` do not emit events, so they send no webhooks.
- The receiver may get one event more than once (a retry after a slow 200). Dedupe on `X-Kiln-Delivery`.
