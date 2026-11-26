import { useQueries, useQuery } from '@tanstack/react-query'
import { ImageIcon, X } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import type { Media } from '../api/client'
import { useAdmin } from '../context'
import { RichTextEditor, type RichTextValue } from '../editor/rich-text-editor'
import { useDebounced } from '../hooks'
import { MediaPickerDialog } from '../media/media-picker'
import { type Field, fieldLabel, type Row } from '../resource'
import { Button, cx, FieldShell, Input, SelectBox, Switch, Textarea } from '../ui'

export type FieldInputProps = {
  field: Field
  value: unknown
  onChange: (value: unknown) => void
  error?: string
  disabled?: boolean
  /** Changes when the form is loaded with another record: resets editors that keep their own state. */
  formKey: string
}

export function FieldInput({ field, value, onChange, error, disabled, formKey }: FieldInputProps) {
  const label = fieldLabel(field)
  const shell = { label, description: field.description, error, required: field.required }

  switch (field.type) {
    case 'boolean':
      return (
        <FieldShell {...shell} label={label} required={false}>
          {({ id }) => (
            <div className="flex items-center gap-3">
              <Switch id={id} checked={value === true} onChange={onChange} disabled={disabled} />
              <span className="text-sm text-muted">{value === true ? 'Yes' : 'No'}</span>
            </div>
          )}
        </FieldShell>
      )

    case 'textarea':
      return (
        <FieldShell {...shell}>
          {(props) => (
            <Textarea
              {...props}
              rows={field.rows ?? 3}
              maxLength={field.maxLength}
              placeholder={field.placeholder}
              disabled={disabled}
              value={typeof value === 'string' ? value : ''}
              onChange={(event) => onChange(event.target.value)}
            />
          )}
        </FieldShell>
      )

    case 'number':
      return (
        <FieldShell {...shell}>
          {(props) => (
            <Input
              {...props}
              type="number"
              step={field.integer ? 1 : 'any'}
              placeholder={field.placeholder}
              disabled={disabled}
              value={typeof value === 'number' ? String(value) : ''}
              onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))}
            />
          )}
        </FieldShell>
      )

    case 'select':
      return (
        <FieldShell {...shell}>
          {({ id }) => (
            <SelectBox
              id={id}
              value={typeof value === 'string' ? value : null}
              onChange={onChange}
              options={field.options}
              placeholder={field.placeholder ?? 'Select…'}
              allowEmpty={!field.required}
              disabled={disabled}
            />
          )}
        </FieldShell>
      )

    case 'image':
      return (
        <FieldShell {...shell}>
          {() => (
            <ImageInput value={typeof value === 'string' ? value : null} onChange={onChange} disabled={disabled} />
          )}
        </FieldShell>
      )

    case 'richtext':
      return (
        <FieldShell {...shell}>
          {({ id, 'aria-invalid': invalid }) => (
            <RichTextEditor
              key={formKey}
              id={id}
              invalid={invalid}
              label={label}
              format={field.format ?? 'json'}
              placeholder={field.placeholder}
              value={(value ?? null) as RichTextValue}
              onChange={onChange}
            />
          )}
        </FieldShell>
      )

    case 'media':
      return (
        <FieldShell {...shell}>
          {() => (
            <MediaInput value={typeof value === 'string' ? value : null} onChange={onChange} disabled={disabled} />
          )}
        </FieldShell>
      )

    case 'relation':
      return (
        <FieldShell {...shell}>
          {({ id }) => <RelationInput id={id} field={field} value={value} onChange={onChange} disabled={disabled} />}
        </FieldShell>
      )

    default:
      // text and slug
      return (
        <FieldShell {...shell}>
          {(props) => (
            <Input
              {...props}
              type={field.type === 'text' ? (field.inputType ?? 'text') : 'text'}
              maxLength={field.type === 'text' ? field.maxLength : undefined}
              placeholder={field.placeholder}
              disabled={disabled}
              autoComplete={field.type === 'text' && field.inputType === 'password' ? 'new-password' : undefined}
              value={typeof value === 'string' ? value : ''}
              onChange={(event) => onChange(event.target.value)}
            />
          )}
        </FieldShell>
      )
  }
}

function ImageInput({
  value,
  onChange,
  disabled,
}: {
  value: string | null
  onChange: (value: string | null) => void
  disabled?: boolean
}) {
  const [picking, setPicking] = useState(false)
  return (
    <div className="flex flex-col gap-2">
      {value ? (
        <div className="overflow-hidden rounded-md border border-line bg-subtle">
          <img src={value} alt="" className="max-h-48 w-full object-cover" />
        </div>
      ) : null}
      <div className="flex gap-2">
        <Button size="sm" disabled={disabled} onClick={() => setPicking(true)}>
          <ImageIcon className="size-3.5" />
          {value ? 'Replace' : 'Choose image'}
        </Button>
        {value && (
          <Button size="sm" variant="ghost" disabled={disabled} onClick={() => onChange(null)}>
            <X className="size-3.5" />
            Remove
          </Button>
        )}
      </div>
      <MediaPickerDialog
        open={picking}
        onClose={() => setPicking(false)}
        onPick={(media) => {
          onChange(media.url)
          setPicking(false)
        }}
      />
    </div>
  )
}

function MediaInput({
  value,
  onChange,
  disabled,
}: {
  value: string | null
  onChange: (value: string | null) => void
  disabled?: boolean
}) {
  const { client } = useAdmin()
  const [picking, setPicking] = useState(false)
  const file = useQuery({
    queryKey: ['media-item', value],
    queryFn: () => client.get<Media>(`/admin/media/${value}`),
    enabled: Boolean(value),
  })
  const media = value ? file.data : undefined
  return (
    <div className="flex flex-col gap-2">
      {value && (
        <div className="flex items-center gap-3 overflow-hidden rounded-md border border-line bg-subtle p-2">
          {media?.contentType.startsWith('image/') ? (
            <img src={media.url} alt={media.alt ?? ''} className="size-16 shrink-0 rounded object-cover" />
          ) : (
            <ImageIcon className="size-6 shrink-0 text-muted" />
          )}
          <span className="min-w-0 truncate text-xs text-muted">
            {file.isError ? 'File not found' : (media?.fileName ?? 'Loading…')}
          </span>
        </div>
      )}
      <div className="flex gap-2">
        <Button size="sm" disabled={disabled} onClick={() => setPicking(true)}>
          <ImageIcon className="size-3.5" />
          {value ? 'Replace' : 'Choose file'}
        </Button>
        {value && (
          <Button size="sm" variant="ghost" disabled={disabled} onClick={() => onChange(null)}>
            <X className="size-3.5" />
            Remove
          </Button>
        )}
      </div>
      <MediaPickerDialog
        open={picking}
        onClose={() => setPicking(false)}
        onPick={(picked) => {
          onChange(picked.id)
          setPicking(false)
        }}
      />
    </div>
  )
}

/** How many matches the relation search shows. */
const RELATION_RESULTS = 20

function RelationInput({
  id,
  field,
  value,
  onChange,
  disabled,
}: {
  id: string
  field: Extract<Field, { type: 'relation' }>
  value: unknown
  onChange: (value: unknown) => void
  disabled?: boolean
}) {
  const { client, resources } = useAdmin()
  const target = resources.find((resource) => resource.name === field.resource)
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const query = useDebounced(search)

  let selected: string[] = []
  if (field.multiple) selected = Array.isArray(value) ? value.map(String) : []
  else if (typeof value === 'string' && value) selected = [value]

  // Names of the chosen records: one request each, shared with the edit page's cache.
  const chosen = useQueries({
    queries: selected.map((recordId) => ({
      queryKey: ['record', field.resource, recordId],
      queryFn: () => client.get<Row>(`${target?.path}/${recordId}`),
      enabled: Boolean(target),
      staleTime: 60_000,
    })),
  })

  const searchParam = target?.searchParam === undefined ? 'search' : target.searchParam
  const results = useQuery({
    queryKey: ['relation', field.resource, query],
    enabled: Boolean(target) && open,
    queryFn: async () => {
      if (!target) return []
      const page = await client.list<Row>(target.path, {
        limit: searchParam ? RELATION_RESULTS : 100,
        ...(searchParam && query ? { [searchParam]: query } : {}),
      })
      return page.data
    },
  })

  if (!target) return <p className="text-xs text-danger">Unknown resource “{field.resource}”.</p>
  const nameOf = (row: Row | undefined, recordId: string) => String(row?.[target.titleField] ?? recordId)

  const pick = (recordId: string) => {
    if (field.multiple) onChange(selected.includes(recordId) ? selected : [...selected, recordId])
    else {
      onChange(recordId)
      setOpen(false)
    }
    setSearch('')
  }
  const drop = (recordId: string) =>
    onChange(field.multiple ? selected.filter((current) => current !== recordId) : null)

  // Without a search parameter the API returns everything: filter the names here.
  const filtered = (results.data ?? []).filter(
    (row) => searchParam || !query || nameOf(row, String(row.id)).toLowerCase().includes(query.toLowerCase()),
  )

  let list: ReactNode
  if (results.isLoading) list = <p className="px-2.5 py-1.5 text-xs text-muted">Loading…</p>
  else if (filtered.length === 0) list = <p className="px-2.5 py-1.5 text-xs text-muted">No matches</p>
  else
    list = filtered.map((row) => {
      const recordId = String(row.id)
      const on = selected.includes(recordId)
      return (
        <button
          key={recordId}
          type="button"
          role="option"
          aria-selected={on}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => pick(recordId)}
          className={cx(
            'flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm hover:bg-subtle',
            on && 'text-accent',
          )}
        >
          {nameOf(row, recordId)}
        </button>
      )
    })

  return (
    <div className="relative flex flex-col gap-2">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((recordId, index) => {
            const name = chosen[index]?.isError ? `Missing (${recordId})` : nameOf(chosen[index]?.data, recordId)
            return (
              <span
                key={recordId}
                className="inline-flex items-center gap-1 rounded-full border border-accent bg-accent/15 py-0.5 pr-1 pl-2.5 text-xs text-accent"
              >
                {name}
                <button
                  type="button"
                  aria-label={`Remove ${name}`}
                  disabled={disabled}
                  onClick={() => drop(recordId)}
                  className="rounded-full p-0.5 hover:bg-accent/20"
                >
                  <X className="size-3" />
                </button>
              </span>
            )
          })}
        </div>
      )}
      {(field.multiple || selected.length === 0) && (
        <Input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          placeholder={field.placeholder ?? `Search ${target.label.toLowerCase()}…`}
          disabled={disabled}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          // Lets a click on a result land before the list closes.
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setOpen(false)
          }}
        />
      )}
      {open && (
        <div
          role="listbox"
          className="absolute top-full z-[80] mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-line bg-surface py-1 shadow-lg"
        >
          {list}
        </div>
      )}
    </div>
  )
}
