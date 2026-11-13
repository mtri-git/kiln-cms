import { customAlphabet } from 'nanoid'

/**
 * ID Generation Strategy:
 * - Table PKs: UUID v4 via Drizzle's defaultRandom() (generated on INSERT)
 * - Slug IDs: Alphanumeric, human-readable (lowercase + digits)
 * - Request IDs: 16-char mixed-case alphanumeric for tracking/debugging
 */

// Alphanumeric alphabet (letters + numbers)
const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

/**
 * Generate ID with custom length (mixed-case alphanumeric)
 * Used for non-PK IDs where readability matters
 */
export const generateId = (length: number = 21): string => {
  const nanoid = customAlphabet(ALPHABET, length)
  return nanoid()
}

/**
 * Generate slug-friendly ID (lowercase alphanumeric only)
 * Safe for URL paths and human-readable contexts
 */
export const generateSlugId = (length: number = 10): string => {
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz'
  const nanoid = customAlphabet(alphabet, length)
  return nanoid()
}

/**
 * Generate request ID for observability (16-char mixed-case alphanumeric)
 * Used in logging, tracing, and error tracking
 */
export const generateRequestId = (): string => {
  return generateId(16)
}
