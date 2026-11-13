import { getEnv, getStore } from '../core/request-context'

export const isProduction = (): boolean => getEnv().NODE_ENV === 'production'

export const getCorsOrigins = (): string[] =>
  (getEnv().CORS_ALLOW_LIST || '')
    .split('|')
    .map((origin) => origin.trim())
    .filter(Boolean)

/** Base URL that uploaded files are served from, without a trailing slash. */
export const getFilesBaseUrl = (): string =>
  (getEnv().FILES_PUBLIC_URL || getEnv().R2_PUBLIC_URL || `${getStore().origin}/files`).replace(/\/+$/, '')
