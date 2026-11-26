import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Check, ChevronLeft, ChevronRight, Plus, Search } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { useAdmin } from '../context'
import { formatDate, useDebounced } from '../hooks'
import { type Column, getPath, humanize, type Resource, type Row, singularOf } from '../resource'
import { Link, useNavigate } from '../router'
import { Badge, Button, Card, Centered, IconButton, Input, SelectBox, Spinner } from '../ui'

const PAGE_SIZE = 20

type NormalColumn = Exclude<Column, string>

const normalize = (column: Column): NormalColumn => (typeof column === 'string' ? { name: column } : column)

const BADGE_OK = new Set(['published', 'active', 'live', 'public', 'admin'])

function renderCell(column: NormalColumn, row: Row): ReactNode {
  if (column.render) return column.render(row)
  const value = getPath(row, column.name)
  if (value === null || value === undefined || value === '') return <span className="text-muted">—</span>

  const type = column.type ?? (typeof value === 'boolean' ? 'boolean' : /At$/.test(column.name) ? 'date' : 'text')
  switch (type) {
    case 'date':
      return <span className="whitespace-nowrap text-muted">{formatDate(value)}</span>
    case 'boolean':
      return value ? <Check className="size-4 text-ok" aria-label="Yes" /> : <span className="text-muted">—</span>
    case 'badge':
      return <Badge tone={BADGE_OK.has(String(value)) ? 'ok' : 'neutral'}>{String(value)}</Badge>
    case 'image':
      return <img src={String(value)} alt="" className="size-9 rounded object-cover" />
    default:
      return <span>{String(value)}</span>
  }
}

export function ResourceList({ resource }: { resource: Resource }) {
  const { client } = useAdmin()
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<Record<string, string | null>>({})
  const debouncedSearch = useDebounced(search)
  const columns = resource.columns.map(normalize)
  const searchParam = resource.searchParam === undefined ? 'search' : resource.searchParam

  const list = useQuery({
    queryKey: ['list', resource.name, page, debouncedSearch, filters],
    queryFn: () =>
      client.list(resource.path, {
        page,
        limit: PAGE_SIZE,
        ...(searchParam ? { [searchParam]: debouncedSearch } : {}),
        ...filters,
      }),
    placeholderData: keepPreviousData,
  })

  const rows = list.data?.data ?? []
  const pagination = list.data?.pagination
  const filtered = Boolean(debouncedSearch) || Object.values(filters).some(Boolean)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{resource.label}</h1>
        {resource.canCreate !== false && (
          <Link to={`/${resource.name}/new`}>
            <Button variant="primary" tabIndex={-1}>
              <Plus className="size-4" />
              New {singularOf(resource).toLowerCase()}
            </Button>
          </Link>
        )}
      </div>

      {(searchParam || (resource.filters?.length ?? 0) > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          {searchParam && (
            <div className="relative min-w-48 flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted" />
              <Input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  setPage(1)
                }}
                placeholder={`Search ${resource.label.toLowerCase()}`}
                aria-label={`Search ${resource.label.toLowerCase()}`}
                className="pl-8"
              />
            </div>
          )}
          {resource.filters?.map((filter) => (
            <div key={filter.name} className="w-40">
              <SelectBox
                value={filters[filter.name] ?? null}
                options={filter.options}
                placeholder={filter.label}
                onChange={(value) => {
                  setFilters((current) => ({ ...current, [filter.name]: value }))
                  setPage(1)
                }}
              />
            </div>
          ))}
        </div>
      )}

      <Card className="overflow-hidden">
        {list.isLoading ? (
          <Centered>
            <Spinner /> Loading…
          </Centered>
        ) : list.isError ? (
          <Centered>Could not load {resource.label.toLowerCase()}.</Centered>
        ) : rows.length === 0 ? (
          <Centered>
            {filtered ? `No ${resource.label.toLowerCase()} match.` : `No ${resource.label.toLowerCase()} yet.`}
          </Centered>
        ) : (
          <div className="overflow-x-auto">
            <table className="text-sm">
              <thead>
                <tr className="border-b border-line bg-subtle/50 text-left text-xs text-muted">
                  {columns.map((column) => (
                    <th key={column.name} scope="col" className="px-4 py-2.5 font-medium">
                      {column.label ?? humanize(column.name.split('.')[0])}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const target = `/${resource.name}/${String(row.id)}`
                  return (
                    <tr
                      key={String(row.id)}
                      onClick={() => navigate(target)}
                      className="cursor-pointer border-b border-line last:border-0 hover:bg-subtle/60"
                    >
                      {columns.map((column, index) => (
                        <td key={column.name} className="px-4 py-2.5 align-middle">
                          {index === 0 ? (
                            // The first cell is a real link, so keyboard users and middle-click work.
                            <Link
                              to={target}
                              className="font-medium hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {renderCell(column, row)}
                            </Link>
                          ) : (
                            renderCell(column, row)
                          )}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted">
          <span>
            Page {pagination.page} of {pagination.totalPages} · {pagination.total} total
          </span>
          <div className="flex gap-1">
            <IconButton aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              <ChevronLeft className="size-4" />
            </IconButton>
            <IconButton aria-label="Next page" disabled={!pagination.hasMore} onClick={() => setPage(page + 1)}>
              <ChevronRight className="size-4" />
            </IconButton>
          </div>
        </div>
      )}
    </div>
  )
}
