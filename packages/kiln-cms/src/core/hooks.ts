import { getStore, type WorkerEnv } from './request-context'
import { logger } from './utils/logger'

export type ChangeAction = 'created' | 'updated' | 'deleted' | 'published' | 'unpublished'

/** One successful write. `resource` is the module name (`posts`, `categories`...), `id` the row id. */
export type ChangeEvent = { resource: string; action: ChangeAction; id: string }

/** `Env` is the app's own bindings type when it has bindings `WorkerEnv` does not list. */
export type ChangeHandler<Env extends object = WorkerEnv> = (event: ChangeEvent, env: Env) => void | Promise<void>

const handlers = new Set<ChangeHandler<object>>()

/** Registers a handler for every content change. Call it in `src/hooks.ts`. Returns a function that removes it. */
export function onChange<Env extends object = WorkerEnv>(handler: ChangeHandler<Env>): () => void {
  const registered = handler as ChangeHandler<object>
  handlers.add(registered)
  return () => {
    handlers.delete(registered)
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
