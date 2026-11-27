import type { ReactNode } from 'react'

/** A record as the API returns it. */
export type Row = Record<string, unknown>

type FieldBase = {
  /** Key in the request body and (unless `read` is set) in the response. */
  name: string
  label?: string
  description?: string
  placeholder?: string
  required?: boolean
  /** `sidebar` puts the field in the narrow right column of the edit page. Default `main`. */
  position?: 'main' | 'sidebar'
  /** Show the field only when creating, only when editing, or always (default). */
  mode?: 'create' | 'edit'
  /** Shown but never sent. */
  readOnly?: boolean
  /** Shown on edit but never sent there (e.g. an email the API does not let you change). */
  readOnlyOnEdit?: boolean
  /** Leave the field out of the request when it is empty (e.g. a password on edit). */
  omitIfEmpty?: boolean
  /** Read the form value from a record when it is not `record[name]` (e.g. `tagIds` from `record.tags`). */
  read?: (record: Row) => unknown
}

export type SelectOption = { value: string; label: string }

export type Field =
  | (FieldBase & { type: 'text'; inputType?: 'text' | 'email' | 'password' | 'url'; maxLength?: number })
  | (FieldBase & { type: 'textarea'; rows?: number; maxLength?: number })
  | (FieldBase & { type: 'number'; integer?: boolean })
  | (FieldBase & { type: 'boolean' })
  | (FieldBase & { type: 'select'; options: SelectOption[] })
  /** A URL-safe text that is filled in from another field until you edit it. */
  | (FieldBase & { type: 'slug'; from: string })
  /** Pick an image from the media library. Stores its URL. */
  | (FieldBase & { type: 'image' })
  /** Tiptap editor. `json` stores the document object, `html` stores a string. Default `json`. */
  | (FieldBase & { type: 'richtext'; format?: 'json' | 'html' })
  /** Pick one (`id`) or many (`id[]`) records of another resource. Searches it with its `searchParam`. */
  | (FieldBase & { type: 'relation'; resource: string; multiple?: boolean })
  /** Pick a file from the media library. Stores its id; a record that holds `{ id, ... }` is read as that id. */
  | (FieldBase & { type: 'media' })

export type Column =
  | string
  | {
      /** Field name, or a path into the record such as `category.name`. */
      name: string
      label?: string
      type?: 'text' | 'date' | 'badge' | 'boolean' | 'image'
      render?: (record: Row) => ReactNode
    }

export type Filter = {
  /** Query parameter sent to the list endpoint. */
  name: string
  label: string
  options: SelectOption[]
}

/** A button on the edit page that calls an endpoint of the record, e.g. publish. */
export type Action = {
  label: string
  /** Path after the record's path. `{id}` is replaced. Example: `/{id}/publish`. */
  path: string
  method?: 'post' | 'patch' | 'delete'
  variant?: 'primary' | 'secondary' | 'danger'
  /** Show the button only for some records. */
  when?: (record: Row) => boolean
  successMessage?: string
}

export type Resource = {
  /** Used in the URL (`#/posts`) and by `relation` fields. */
  name: string
  /** Plural label for the menu and the list title. */
  label: string
  /** Singular label for buttons. Default: the label without a trailing "s". */
  singular?: string
  /** API path of the admin routes, e.g. `/admin/posts`. */
  path: string
  /** Field used as the name of a record (page title, relation options). */
  titleField: string
  fields: Field[]
  columns: Column[]
  /** Query parameter for the search box. `false` hides it. Default `search`. */
  searchParam?: string | false
  filters?: Filter[]
  actions?: Action[]
  /** Heading above this resource in the menu. */
  group?: string
  /** Menu icon, e.g. a lucide icon at `size-4`. Without one the collapsed menu shows the first letter. */
  icon?: ReactNode
  canCreate?: boolean
  canDelete?: boolean
}

/**
 * A single document, such as site settings, served by the `globals` option of the API.
 * The admin reads `{ data }` from `GET path` and saves the form with `PUT path`.
 */
export type Global = {
  /** Used in the URL: `#/globals/settings`. */
  name: string
  label: string
  /** API path, e.g. `/admin/globals/settings`. */
  path: string
  fields: Field[]
  /** Heading above it in the menu. Default `Settings`. */
  group?: string
  /** Menu icon, as on a resource. */
  icon?: ReactNode
}

/** Identity helper that checks the shape of a global. */
export function defineGlobal(global: Global): Global {
  return global
}

/** Identity helper that checks the shape of a resource. */
export function defineResource(resource: Resource): Resource {
  return resource
}

export const fieldLabel = (field: Field) => field.label ?? humanize(field.name)

export function humanize(name: string): string {
  const spaced = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

export const singularOf = (resource: Resource) =>
  resource.singular ?? (resource.label.endsWith('s') ? resource.label.slice(0, -1) : resource.label)

/** Read `a.b.c` from a record. */
export function getPath(record: Row, path: string): unknown {
  let current: unknown = record
  for (const key of path.split('.')) {
    if (current === null || typeof current !== 'object') return undefined
    current = (current as Row)[key]
  }
  return current
}

export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
