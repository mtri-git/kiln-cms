import { getStore, type WorkerEnv } from './request-context'
import { logger } from './utils/logger'

export type ChangeAction = 'created' | 'updated' | 'deleted' | 'published' | 'unpublished'

/** One successful write. `resource` is the module name (`posts`, `categories`...), `id` the row id. */
export type ChangeEvent = { resource: string; action: ChangeAction; id: string }

export type ChangeHandler = (event: ChangeEvent, env: WorkerEnv) => void | Promise<void>

const handlers = new Set<ChangeHandler>()

/** Registers a handler for every content change. Call it in `src/hooks.ts`. Returns a function that removes it. */
export function onChange(handler: ChangeHandler): () => void {
  handlers.add(handler)
  return () => {
    handlers.delete(handler)
  }
}

/**
 * Services call this after a write has succeeded. Handlers run after the response is sent
 * (`waitUntil`), so they never slow down or fail the request: a handler that throws is only logged.
 */
export function emitChange(resource: string, action: ChangeAction, id: string): void {
  if (handlers.size === 0) return
  const { env, waitUntil } = getStore()
  const event: ChangeEvent = { resource, action, id }
  waitUntil(
    Promise.all(
      [...handlers].map(async (handler) => {
        try {
          await handler(event, env)
        } catch (error) {
          logger.error(
            { type: 'hook_error', ...event, error: error instanceof Error ? error.message : String(error) },
            'Change hook failed',
          )
        }
      }),
    ),
  )
}
