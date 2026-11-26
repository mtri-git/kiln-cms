// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { type ReactNode, useState } from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { ApiClient } from '../../src/admin/api/client'
import { AdminContext, PortalRootContext, ToastProvider } from '../../src/admin/context'
import { FieldInput } from '../../src/admin/fields/field-input'
import { initialValues } from '../../src/admin/fields/values'
import { GlobalEdit } from '../../src/admin/pages/global-edit'
import { defineGlobal, defineResource, type Field } from '../../src/admin/resource'

afterEach(cleanup)

const tags = defineResource({
  name: 'tags',
  label: 'Tags',
  path: '/admin/tags',
  titleField: 'name',
  columns: ['name'],
  fields: [],
})

const ALL_TAGS = Array.from({ length: 150 }, (_, index) => ({ id: `t${index}`, name: `Tag ${index}` }))

function fakeClient() {
  return {
    list: vi.fn(async (_path: string, query: Record<string, unknown> = {}) => {
      const search = String(query.search ?? '').toLowerCase()
      const rows = ALL_TAGS.filter((tag) => tag.name.toLowerCase().includes(search)).slice(0, Number(query.limit))
      return { data: rows, pagination: { total: rows.length, page: 1, limit: 20, totalPages: 1, hasMore: false } }
    }),
    get: vi.fn(async (path: string) => {
      if (path.startsWith('/admin/tags/')) return ALL_TAGS.find((tag) => path.endsWith(`/${tag.id}`))
      if (path.startsWith('/admin/media/'))
        return { id: 'm1', fileName: 'cover.jpg', contentType: 'image/jpeg', url: '/files/cover.jpg', alt: null }
      if (path === '/admin/globals/settings')
        return { name: 'settings', data: { tagline: 'Old', extra: 1 }, updatedAt: null }
      throw new Error(`unexpected ${path}`)
    }),
    put: vi.fn(async (_path: string, data: unknown) => ({ name: 'settings', data, updatedAt: '2026-01-01T00:00:00Z' })),
  }
}

function setup(ui: ReactNode, client = fakeClient()) {
  const user = { id: '1', email: 'a@x.dev', fullName: 'Admin', role: 'admin' as const, isActive: true }
  const view = render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <PortalRootContext.Provider value={document.body}>
          <AdminContext.Provider
            value={{
              client: client as unknown as ApiClient,
              resources: [tags],
              globals: [],
              user,
              signOut: () => undefined,
            }}
          >
            {ui}
          </AdminContext.Provider>
        </PortalRootContext.Provider>
      </ToastProvider>
    </QueryClientProvider>,
  )
  return { view, client }
}

function Controlled({ field, initial, onValue }: { field: Field; initial: unknown; onValue: (v: unknown) => void }) {
  const [value, setValue] = useState(initial)
  return (
    <FieldInput
      field={field}
      value={value}
      formKey="x"
      onChange={(next) => {
        setValue(next)
        onValue(next)
      }}
    />
  )
}

describe('relation field', () => {
  test('searches the target resource instead of loading only the first 100', async () => {
    const onValue = vi.fn()
    const field: Field = { name: 'tagIds', type: 'relation', resource: 'tags', multiple: true }
    const { client } = setup(<Controlled field={field} initial={['t3']} onValue={onValue} />)

    expect(await screen.findByText('Tag 3')).toBeTruthy()
    const input = screen.getByRole('combobox')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'Tag 149' } })
    const option = await screen.findByRole('option', { name: 'Tag 149' })
    expect(client.list).toHaveBeenLastCalledWith('/admin/tags', { limit: 20, search: 'Tag 149' })
    fireEvent.click(option)
    expect(onValue).toHaveBeenLastCalledWith(['t3', 't149'])

    fireEvent.click(screen.getByRole('button', { name: 'Remove Tag 3' }))
    expect(onValue).toHaveBeenLastCalledWith(['t149'])
  })

  test('a single relation hides the search once a record is chosen', async () => {
    const onValue = vi.fn()
    const field: Field = { name: 'tagId', type: 'relation', resource: 'tags' }
    setup(<Controlled field={field} initial={null} onValue={onValue} />)
    fireEvent.focus(screen.getByRole('combobox'))
    fireEvent.click(await screen.findByRole('option', { name: 'Tag 0' }))
    expect(onValue).toHaveBeenLastCalledWith('t0')
    await waitFor(() => expect(screen.queryByRole('combobox')).toBeNull())
  })
})

describe('media field', () => {
  test('reads an expanded file as its id and shows its name', async () => {
    const field: Field = { name: 'featuredImage', type: 'media' }
    const values = initialValues([field], { featuredImage: { id: 'm1', url: '/files/cover.jpg' } })
    expect(values.featuredImage).toBe('m1')
    const onValue = vi.fn()
    setup(<Controlled field={field} initial={values.featuredImage} onValue={onValue} />)
    expect(await screen.findByText('cover.jpg')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Remove/ }))
    expect(onValue).toHaveBeenLastCalledWith(null)
  })
})

describe('global form', () => {
  test('loads the document and saves it with PUT, keeping fields the form does not show', async () => {
    const settings = defineGlobal({
      name: 'settings',
      label: 'Settings',
      path: '/admin/globals/settings',
      fields: [{ name: 'tagline', type: 'text' }],
    })
    const { client } = setup(<GlobalEdit global={settings} />)
    const input = (await screen.findByDisplayValue('Old')) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'New' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(client.put).toHaveBeenCalledWith('/admin/globals/settings', { tagline: 'New', extra: 1 }),
    )
  })
})
