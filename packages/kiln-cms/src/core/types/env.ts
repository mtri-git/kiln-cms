import type { UserRole } from '../constants'
import type { WorkerEnv } from '../request-context'

/** The signed-in user, set by `requireAuth`. */
export type AuthUser = {
  userId: string
  email: string
  role: UserRole
}

/** Hono env for every router: `new OpenAPIHono<AppEnv>()`. */
export type AppEnv = {
  Bindings: WorkerEnv
  Variables: {
    requestId: string
    user?: AuthUser
  }
}
