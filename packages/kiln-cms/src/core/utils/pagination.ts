export type PaginationParamsInput = {
  page?: number
  limit?: number
  defaultLimit?: number
  maxLimit?: number
}

export type PaginationParams = {
  page: number
  limit: number
  offset: number
}

export type PaginationMeta = {
  total: number
  page: number
  limit: number
  totalPages: number
  hasMore: boolean
}

export function getPaginationParams(input: PaginationParamsInput = {}): PaginationParams {
  const defaultLimit = input.defaultLimit ?? 20
  const maxLimit = input.maxLimit ?? 100
  const rawPage = Number(input.page ?? 1)
  const rawLimit = Number(input.limit ?? defaultLimit)

  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1
  const limitBase = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : defaultLimit
  const limit = Math.min(limitBase, maxLimit)
  const offset = (page - 1) * limit

  return { page, limit, offset }
}

export function getPaginationMeta(total: number, page: number, limit: number): PaginationMeta {
  const safeTotal = Math.max(0, Number(total) || 0)
  const safeLimit = Math.max(1, Number(limit) || 1)
  const safePage = Math.max(1, Number(page) || 1)
  const totalPages = Math.max(1, Math.ceil(safeTotal / safeLimit))
  const hasMore = safePage < totalPages
  return { total: safeTotal, page: safePage, limit: safeLimit, totalPages, hasMore }
}

export function buildPagination(total: number, params: PaginationParams): { pagination: PaginationMeta } {
  return { pagination: getPaginationMeta(total, params.page, params.limit) }
}
