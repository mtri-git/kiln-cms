import type { Field, Row } from '../resource'

/** What a form holds, by field name. */
export type Values = Record<string, unknown>

export const isEmpty = (value: unknown) =>
  value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)

function defaultValue(field: Field): unknown {
  switch (field.type) {
    case 'boolean':
      return false
    case 'relation':
      return field.multiple ? [] : null
    case 'text':
    case 'textarea':
    case 'slug':
      return ''
    default:
      return null
  }
}

/** A `media` field reads an expanded file (`{ id, url, ... }`) as its id. */
function readValue(field: Field, raw: unknown): unknown {
  if (field.type === 'media' && raw && typeof raw === 'object' && 'id' in raw) return String((raw as Row).id)
  return raw
}

export function initialValues(fields: Field[], record: Row | null): Values {
  const values: Values = {}
  for (const field of fields) {
    const raw = record ? readValue(field, field.read ? field.read(record) : record[field.name]) : undefined
    values[field.name] = raw === undefined || raw === null ? defaultValue(field) : raw
  }
  return values
}

/** The request body: what the form holds, minus what must not be sent. */
export function buildPayload(fields: Field[], values: Values, isNew: boolean): Row {
  const payload: Row = {}
  for (const field of fields) {
    if (field.readOnly || (field.readOnlyOnEdit && !isNew)) continue
    const value = values[field.name]
    if (isEmpty(value)) {
      if (field.omitIfEmpty) continue
      // An empty optional text is "no value", not an empty string.
      payload[field.name] = typeof value === 'string' && field.required ? value : Array.isArray(value) ? [] : null
      continue
    }
    payload[field.name] = value
  }
  return payload
}

/** Required fields left empty, as `{ name: message }`. */
export function missingFields(fields: Field[], values: Values, isNew: boolean): Record<string, string> {
  const missing: Record<string, string> = {}
  for (const field of fields) {
    const required = field.required && !(field.omitIfEmpty && !isNew)
    if (required && !field.readOnly && isEmpty(values[field.name])) missing[field.name] = 'This field is required'
  }
  return missing
}
