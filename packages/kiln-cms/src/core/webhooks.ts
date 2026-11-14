import type { ChangeEvent } from './hooks'
import type { KilnEnv } from './request-context'
import { generateId } from './utils/gen-id'
import { logger } from './utils/logger'

/** The JSON body of every webhook request. `id` is the row id, `event` is `<resource>.<action>`. */
export type WebhookPayload = ChangeEvent & { event: string; occurredAt: string }

/** Retry delays after a failed attempt: 3 attempts in all, well inside the ~30 s Cloudflare gives `waitUntil`. */
const RETRY_DELAYS_MS = [1000, 3000]
const ATTEMPT_TIMEOUT_MS = 8000
/** How old a signed request may be when `verifyWebhook` checks it. */
const DEFAULT_TOLERANCE_SECONDS = 300

const split = (value: string | undefined): string[] =>
  (value || '')
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean)

/** `WEBHOOK_EVENTS` entries: `posts.published`, `posts.*`, `*.deleted` or `*`. Empty sends every event. */
function wanted(event: string, filters: string[]): boolean {
  if (filters.length === 0) return true
  const [resource, action] = event.split('.')
  return filters.some((filter) => {
    const [r, a = '*'] = filter.split('.')
    return (r === '*' || r === resource) && (a === '*' || a === action)
  })
}

/**
 * The change handler `createApp` registers. Posts each event to every URL in `WEBHOOK_URLS`.
 * Runs after the response (see `emitChange`), so a slow or failing receiver never fails a request.
 */
export async function deliverWebhooks(change: ChangeEvent, env: KilnEnv): Promise<void> {
  const urls = split(env.WEBHOOK_URLS)
  if (urls.length === 0) return
  const event = `${change.resource}.${change.action}`
  if (!wanted(event, split(env.WEBHOOK_EVENTS))) return

  const payload: WebhookPayload = { event, ...change, occurredAt: new Date().toISOString() }
  const body = JSON.stringify(payload)
  // One id for every attempt and every URL: receivers drop a delivery they have already handled.
  const deliveryId = generateId(21)
  await Promise.all(urls.map((url) => deliver(url, body, event, deliveryId, env.WEBHOOK_SECRET)))
}

async function deliver(url: string, body: string, event: string, deliveryId: string, secret?: string): Promise<void> {
  let lastError = ''
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt - 1]))
    // A new timestamp (and signature) per attempt, so a retry is not rejected as too old.
    const timestamp = Math.floor(Date.now() / 1000)
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'kiln-cms-webhook',
      'X-Kiln-Event': event,
      'X-Kiln-Delivery': deliveryId,
      'X-Kiln-Timestamp': String(timestamp),
    }
    if (secret) headers['X-Kiln-Signature'] = await signWebhook(secret, timestamp, body)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
      })
      // Drain the body so the connection is released.
      await res.body?.cancel().catch(() => {})
      if (res.ok) return
      lastError = `HTTP ${res.status}`
      if (!(res.status === 408 || res.status === 429 || res.status >= 500)) break
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
  }
  logger.error({ type: 'webhook_failed', url, event, deliveryId, error: lastError }, 'Webhook delivery failed')
}

const encoder = new TextEncoder()

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ])
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message))
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** The `X-Kiln-Signature` value: `sha256=` + hex HMAC-SHA256 of `<timestamp>.<body>` with the secret. */
export async function signWebhook(secret: string, timestamp: number, body: string): Promise<string> {
  return `sha256=${await hmacHex(secret, `${timestamp}.${body}`)}`
}

/**
 * For a receiver: true when the request was signed with `secret` less than `toleranceSeconds` ago.
 * Pass the raw body text, before parsing it.
 */
export async function verifyWebhook(input: {
  secret: string
  body: string
  timestamp: string | null | undefined
  signature: string | null | undefined
  toleranceSeconds?: number
}): Promise<boolean> {
  const timestamp = Number(input.timestamp)
  if (!input.signature || !Number.isInteger(timestamp)) return false
  const age = Math.abs(Date.now() / 1000 - timestamp)
  if (age > (input.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS)) return false
  const expected = await signWebhook(input.secret, timestamp, input.body)
  if (expected.length !== input.signature.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ input.signature.charCodeAt(i)
  return diff === 0
}
