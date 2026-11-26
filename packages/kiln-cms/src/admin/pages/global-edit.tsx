import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useEffect, useState } from 'react'
import { ApiError } from '../api/client'
import { useAdmin, useToast } from '../context'
import { FieldInput } from '../fields/field-input'
import { buildPayload, initialValues, missingFields, type Values } from '../fields/values'
import { formatDate } from '../hooks'
import type { Global, Row } from '../resource'
import { Button, Card, Centered, Spinner } from '../ui'

/** What `GET /admin/globals/{name}` returns. */
type GlobalValue = { name: string; data: Row | null; updatedAt: string | null }

export function GlobalEdit({ global }: { global: Global }) {
  const { client } = useAdmin()
  const value = useQuery({
    queryKey: ['global', global.name],
    queryFn: () => client.get<GlobalValue>(global.path),
  })

  if (value.isLoading)
    return (
      <Centered>
        <Spinner /> Loading…
      </Centered>
    )
  if (value.isError || !value.data) return <Centered>Could not load it.</Centered>
  return <GlobalForm key={global.name} global={global} value={value.data} />
}

function GlobalForm({ global, value }: { global: Global; value: GlobalValue }) {
  const { client } = useAdmin()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [values, setValues] = useState<Values>(() => initialValues(global.fields, value.data))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const save = useMutation({
    // The whole document is replaced, so fields the form does not know about are kept as they were.
    mutationFn: (payload: Row) => client.put<GlobalValue>(global.path, { ...(value.data ?? {}), ...payload }),
    onSuccess: (saved) => {
      setDirty(false)
      queryClient.setQueryData(['global', global.name], saved)
      toast(`${global.label} saved`)
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        setErrors(error.fieldErrors)
        toast(error.message, 'error')
      } else toast('Could not reach the server', 'error')
    },
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const missing = missingFields(global.fields, values, true)
    setErrors(missing)
    if (Object.keys(missing).length > 0) {
      toast('Fill in the required fields', 'error')
      return
    }
    save.mutate(buildPayload(global.fields, values, true))
  }

  const change = (name: string, next: unknown) => {
    setDirty(true)
    setErrors(({ [name]: _removed, ...rest }) => rest)
    setValues((current) => ({ ...current, [name]: next }))
  }

  const mainFields = global.fields.filter((field) => field.position !== 'sidebar')
  const sideFields = global.fields.filter((field) => field.position === 'sidebar')
  const renderField = (field: Global['fields'][number]) => (
    <FieldInput
      key={field.name}
      field={field}
      value={values[field.name]}
      onChange={(next) => change(field.name, next)}
      error={errors[field.name]}
      disabled={field.readOnly}
      formKey={global.name}
    />
  )

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <h1 className="truncate text-xl font-semibold">{global.label}</h1>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card className="flex flex-col gap-5 p-5">{mainFields.map(renderField)}</Card>
        <div className="flex flex-col gap-4 lg:sticky lg:top-4">
          <Card className="flex flex-col gap-3 p-4">
            <Button type="submit" variant="primary" loading={save.isPending} disabled={!dirty}>
              Save changes
            </Button>
            {value.updatedAt && <p className="text-xs text-muted">Updated {formatDate(value.updatedAt)}</p>}
          </Card>
          {sideFields.length > 0 && <Card className="flex flex-col gap-5 p-4">{sideFields.map(renderField)}</Card>}
        </div>
      </div>
    </form>
  )
}
