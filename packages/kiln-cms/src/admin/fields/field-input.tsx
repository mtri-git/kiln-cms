import { useQuery } from '@tanstack/react-query'
import { ImageIcon, X } from 'lucide-react'
import { useState } from 'react'
import { useAdmin } from '../context'
import { RichTextEditor, type RichTextValue } from '../editor/rich-text-editor'
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

  const options = useQuery({
    queryKey: ['relation', field.resource],
    enabled: Boolean(target),
    queryFn: async () => {
      if (!target) return []
      const page = await client.list<Row>(target.path, { limit: 100 })
      return page.data.map((row) => ({ value: String(row.id), label: String(row[target.titleField] ?? row.id) }))
    },
  })

  if (!target) return <p className="text-xs text-danger">Unknown resource “{field.resource}”.</p>
  if (options.isLoading) return <p className="text-xs text-muted">Loading…</p>
  const items = options.data ?? []

  if (!field.multiple) {
    return (
      <SelectBox
        id={id}
        value={typeof value === 'string' ? value : null}
        onChange={onChange}
        options={items}
        placeholder={field.placeholder ?? 'None'}
        allowEmpty={!field.required}
        disabled={disabled}
      />
    )
  }

  const selected = Array.isArray(value) ? (value as string[]) : []
  const toggle = (itemId: string) =>
    onChange(selected.includes(itemId) ? selected.filter((current) => current !== itemId) : [...selected, itemId])

  if (items.length === 0) return <p className="text-xs text-muted">Nothing to choose from yet.</p>
  return (
    <fieldset id={id} className="m-0 flex min-w-0 flex-wrap gap-1.5 p-0">
      {items.map((item) => {
        const on = selected.includes(item.value)
        return (
          <button
            key={item.value}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            onClick={() => toggle(item.value)}
            className={cx(
              'rounded-full border px-2.5 py-0.5 text-xs transition-colors disabled:opacity-50',
              on ? 'border-accent bg-accent/15 text-accent' : 'border-line text-muted hover:bg-subtle hover:text-ink',
            )}
          >
            {item.label}
          </button>
        )
      })}
    </fieldset>
  )
}
