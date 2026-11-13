export const USER_ROLES = ['admin', 'editor'] as const
export type UserRole = (typeof USER_ROLES)[number]

/** Requests one client IP may send to the password endpoints (setup, login, change password) per window. */
export const AUTH_RATE_LIMIT = { limit: 10, windowMs: 15 * 60 * 1000 } as const
