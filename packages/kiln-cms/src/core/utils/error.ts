/**
 * Custom error class for API errors
 */
export class ApiError extends Error {
  constructor(
    public code: string,
    public message: string,
    public statusCode: number = 400,
    public details?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
    Object.setPrototypeOf(this, ApiError.prototype)
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
    }
  }
}

/**
 * Common API error factory functions
 */
export const Errors = {
  UNAUTHORIZED: () => new ApiError('UNAUTHORIZED', 'Unauthorized access', 401),
  FORBIDDEN: () => new ApiError('FORBIDDEN', 'Access forbidden', 403),
  NOT_FOUND: (resource: string) => new ApiError('NOT_FOUND', `${resource} not found`, 404),
  CONFLICT: (message: string, details?: unknown) => new ApiError('CONFLICT', message, 409, details),
  BAD_REQUEST: (message: string, details?: unknown) => new ApiError('BAD_REQUEST', message, 400, details),
  INVALID_INPUT: (message: string, details?: unknown) => new ApiError('INVALID_INPUT', message, 400, details),
  INTERNAL_ERROR: (message = 'Internal server error', details?: unknown) =>
    new ApiError('INTERNAL_ERROR', message, 500, details),
  INVALID_CREDENTIALS: () => new ApiError('INVALID_CREDENTIALS', 'Invalid email or password', 401),
  TOKEN_EXPIRED: () => new ApiError('TOKEN_EXPIRED', 'Token has expired', 401),
  INVALID_TOKEN: () => new ApiError('INVALID_TOKEN', 'Invalid or malformed token', 401),
  TOO_MANY_REQUESTS: (retryAfterSeconds: number) =>
    new ApiError('TOO_MANY_REQUESTS', 'Too many attempts. Try again later', 429, { retryAfterSeconds }),
}
