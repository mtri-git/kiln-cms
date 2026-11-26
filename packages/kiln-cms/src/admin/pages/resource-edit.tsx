import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { ApiError } from '../api/client'
import { useAdmin, useToast } from '../context'
import { FieldInput } from '../fields/field-input'
import { buildPayload, initialValues, missingFields, type Values } from '../fields/values'
import { formatDate } from '../hooks'
import { type Field, getPath, type Resource, type Row, singularOf, slugify } from '../resource'
import { Link, useNavigate } from '../router'
import { Badge, Button, Card, Centered, ConfirmDialog, Spinner } from '../ui'

export function ResourceEdit({ resource, id }: { resource: Resource; id: string }) {
  const { client } = useAdmin()
  const isNew = id === 'new'

  const record = useQuery({
    queryKey: ['record', resource.name, id],
    queryFn: () => client.get(`${resource.path}/${id}`),
    enabled: !isNew,
  })

  if (!isNew && record.isLoading)
    return (
      <Centered>
        <Spinner /> Loading…
      </Centered>
    )

  if (!isNew && (record.isError || !record.data))
    return (
      <div className="flex flex-col items-start gap-3">
        <Centered>
          {record.error instanceof ApiError && record.error.status === 404
            ? `This ${singularOf(resource).toLowerCase()} does not exist (any more).`
            : 'Could not load it.'}
        </Centered>
        <Link to={`/${resource.name}`} className="text-sm text-accent hover:underline">
          Back to {resource.label.toLowerCase()}
        </Link>
      </div>
    )

  return <EditForm key={`${resource.name}:${id}`} resource={resource} id={id} record={record.data ?? null} />
}

function EditForm({ resource, id, record }: { resource: Resource; id: string; record: Row | null }) {
  const { client } = useAdmin()
  const toast = useToast()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isNew = record === null

  const fields = resource.fields.filter((field) => field.mode !== (isNew ? 'edit' : 'create'))
  const [values, setValues] = useState<Values>(() => initialValues(fields, record))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [dirty, setDirty] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  // A slug follows its source field until you edit it by hand. On existing records it never follows.
  const slugTouched = useRef(new Set(isNew ? [] : fields.filter((f) => f.type === 'slug').map((f) => f.name)))

  // Ask before closing the tab with unsaved changes.
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const change = (name: string, value: unknown) => {
    setDirty(true)
    setErrors((current) => {
      if (!(name in current)) return current
      const { [name]: _removed, ...rest } = current
      return rest
    })
    setValues((current) => {
      const next = { ...current, [name]: value }
      for (const field of fields) {
        if (field.type === 'slug' && field.from === name && !slugTouched.current.has(field.name)) {
          next[field.name] = slugify(String(value ?? ''))
        }
      }
      return next
    })
    if (fields.some((field) => field.type === 'slug' && field.name === name)) slugTouched.current.add(name)
  }

  const afterWrite = (saved: Row) => {
    setDirty(false)
    queryClient.setQueryData(['record', resource.name, String(saved.id)], saved)
    void queryClient.invalidateQueries({ queryKey: ['list', resource.name] })
    void queryClient.invalidateQueries({ queryKey: ['count', resource.name] })
  }

  const save = useMutation({
    mutationFn: (payload: Row) =>
      isNew ? client.post(resource.path, payload) : client.patch(`${resource.path}/${id}`, payload),
    onSuccess: (saved) => {
      afterWrite(saved)
      toast(`${singularOf(resource)} ${isNew ? 'created' : 'saved'}`)
      if (isNew) navigate(`/${resource.name}/${String(saved.id)}`)
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        setErrors(error.fieldErrors)
        toast(error.message, 'error')
      } else toast('Could not reach the server', 'error')
    },
  })

  const remove = useMutation({
    mutationFn: () => client.remove(`${resource.path}/${id}`),
    onSuccess: () => {
      setDirty(false)
      void queryClient.invalidateQueries({ queryKey: ['list', resource.name] })
      void queryClient.invalidateQueries({ queryKey: ['count', resource.name] })
      queryClient.removeQueries({ queryKey: ['record', resource.name, id] })
      toast(`${singularOf(resource)} deleted`)
      navigate(`/${resource.name}`)
    },
    onError: (error) => toast(error instanceof ApiError ? error.message : 'Could not delete', 'error'),
  })

  const action = useMutation({
    mutationFn: ({ path, method }: { path: string; method: 'post' | 'patch' | 'delete' }) => {
      const url = `${resource.path}${path.replace('{id}', id)}`
      if (method === 'delete') return client.remove(url).then(() => null)
      return method === 'patch' ? client.patch(url, {}) : client.post(url)
    },
    onSuccess: (result, variables) => {
      const label = resource.actions?.find((candidate) => candidate.path === variables.path)
      // A record comes back from publish-style actions: show it. Anything else: reload.
      if (result && typeof result === 'object' && 'id' in result) afterWrite(result)
      else void queryClient.invalidateQueries({ queryKey: ['record', resource.name, id] })
      toast(label?.successMessage ?? 'Done')
    },
    onError: (error) => toast(error instanceof ApiError ? error.message : 'Action failed', 'error'),
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const missing = missingFields(fields, values, isNew)
    setErrors(missing)
    if (Object.keys(missing).length > 0) {
      toast('Fill in the required fields', 'error')
      return
    }
    save.mutate(buildPayload(fields, values, isNew))
  }

  const titleValue = record ? getPath(record, resource.titleField) : null
  const title = isNew ? `New ${singularOf(resource).toLowerCase()}` : String(titleValue ?? singularOf(resource))
  const status = record && typeof record.status === 'string' ? record.status : null
  const visibleActions = isNew
    ? []
    : (resource.actions ?? []).filter((candidate) => (candidate.when ? candidate.when(record) : true))

  const renderField = (field: Field) => {
    const shown = field.omitIfEmpty && !isNew ? { ...field, required: false } : field
    return (
      <FieldInput
        key={field.name}
        field={shown}
        value={values[field.name]}
        onChange={(value) => change(field.name, value)}
        error={errors[field.name]}
        disabled={field.readOnly || (field.readOnlyOnEdit && !isNew)}
        formKey={id}
      />
    )
  }

  const mainFields = fields.filter((field) => field.position !== 'sidebar')
  const sideFields = fields.filter((field) => field.position === 'sidebar')

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div>
        <Link
          to={`/${resource.name}`}
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink"
          onClick={(event) => {
            if (dirty && !window.confirm('You have unsaved changes. Leave this page?')) event.preventDefault()
          }}
        >
          <ArrowLeft className="size-3.5" />
          {resource.label}
        </Link>
        <div className="mt-1 flex items-center gap-3">
          <h1 className="truncate text-xl font-semibold">{title}</h1>
          {status && <Badge tone={status === 'published' ? 'ok' : 'neutral'}>{status}</Badge>}
        </div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card className="flex flex-col gap-5 p-5">{mainFields.map(renderField)}</Card>

        <div className="flex flex-col gap-4 lg:sticky lg:top-4">
          <Card className="flex flex-col gap-3 p-4">
            <Button type="submit" variant="primary" loading={save.isPending} disabled={!isNew && !dirty}>
              {isNew ? `Create ${singularOf(resource).toLowerCase()}` : 'Save changes'}
            </Button>
            {visibleActions.map((candidate) => (
              <Button
                key={candidate.path}
                variant={candidate.variant ?? 'secondary'}
                disabled={dirty}
                title={dirty ? 'Save your changes first' : undefined}
                loading={action.isPending && action.variables?.path === candidate.path}
                onClick={() => action.mutate({ path: candidate.path, method: candidate.method ?? 'post' })}
              >
                {candidate.label}
              </Button>
            ))}
            {record && typeof record.updatedAt === 'string' && (
              <p className="text-xs text-muted">Updated {formatDate(record.updatedAt)}</p>
            )}
          </Card>

          {sideFields.length > 0 && <Card className="flex flex-col gap-5 p-4">{sideFields.map(renderField)}</Card>}

          {!isNew && resource.canDelete !== false && (
            <Button variant="ghost" className="justify-start text-danger" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-4" />
              Delete {singularOf(resource).toLowerCase()}
            </Button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete this ${singularOf(resource).toLowerCase()}?`}
        description="This cannot be undone from the admin."
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
        onClose={() => setConfirmDelete(false)}
      />
    </form>
  )
}
