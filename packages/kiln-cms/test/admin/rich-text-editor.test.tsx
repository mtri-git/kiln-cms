// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { ApiClient } from '../../src/admin/api/client'
import { AdminContext, PortalRootContext, ToastProvider } from '../../src/admin/context'
import { RichTextEditor } from '../../src/admin/editor/rich-text-editor'

afterEach(cleanup)

function fakeClient() {
  return {
    upload: vi.fn(),
    list: vi.fn(async () => ({
      data: [],
      pagination: { total: 0, page: 1, limit: 24, totalPages: 1, hasMore: false },
    })),
  }
}

function setup(ui: ReactNode, client = fakeClient()) {
  const user = { id: '1', email: 'a@x.dev', fullName: 'Admin', role: 'admin' as const, isActive: true }
  const view = render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        {/* AdminApp provides this: dialogs and menus render into it. */}
        <PortalRootContext.Provider value={document.body}>
          <AdminContext.Provider
            value={{ client: client as unknown as ApiClient, resources: [], user, signOut: () => undefined }}
          >
            {ui}
          </AdminContext.Provider>
        </PortalRootContext.Provider>
      </ToastProvider>
    </QueryClientProvider>,
  )
  return { view, client }
}

async function editingArea(container: HTMLElement) {
  return waitFor(() => {
    const element = container.querySelector<HTMLElement>('.ProseMirror')
    expect(element).not.toBeNull()
    return element as HTMLElement
  })
}

describe('RichTextEditor', () => {
  test('names the editing area after the field and puts the id on it', async () => {
    const { view } = setup(<RichTextEditor value={null} onChange={() => undefined} label="Content" id="field-1" />)
    const area = await editingArea(view.container)
    expect(area.getAttribute('aria-label')).toBe('Content')
    expect(area.getAttribute('id')).toBe('field-1')
    expect(area.getAttribute('aria-multiline')).toBe('true')
  })

  test('has a default name', async () => {
    const { view } = setup(<RichTextEditor value={null} onChange={() => undefined} />)
    expect((await editingArea(view.container)).getAttribute('aria-label')).toBe('Rich text editor')
  })

  test('opens with the saved document, or with saved HTML', async () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'From a document' }] }] }
    const first = setup(<RichTextEditor value={doc} onChange={() => undefined} />)
    expect((await editingArea(first.view.container)).textContent).toContain('From a document')
    cleanup()

    const second = setup(
      <RichTextEditor value="<p>From <strong>html</strong></p>" format="json" onChange={() => undefined} />,
    )
    expect((await editingArea(second.view.container)).textContent).toContain('From html')
  })

  test('marks an invalid field', async () => {
    const { view } = setup(<RichTextEditor value={null} onChange={() => undefined} invalid />)
    await editingArea(view.container)
    expect((view.container.firstElementChild as HTMLElement).className).toContain('border-danger')
  })

  test('does not mark a valid field', async () => {
    const { view } = setup(<RichTextEditor value={null} onChange={() => undefined} />)
    await editingArea(view.container)
    expect((view.container.firstElementChild as HTMLElement).className).not.toContain('border-danger')
  })

  test('offers "Image from library" in the Insert menu, which opens the media library', async () => {
    const { view, client } = setup(<RichTextEditor value={null} onChange={() => undefined} />)
    await editingArea(view.container)

    fireEvent.click(await screen.findByRole('button', { name: 'Insert' }))
    fireEvent.click(await screen.findByText('Image from library'))

    expect(await screen.findByText('Choose a file')).not.toBeNull()
    await waitFor(() => expect(client.list).toHaveBeenCalledWith('/admin/media', expect.objectContaining({ page: 1 })))
  })

  test('shows the other blocks of the editor in the Insert menu', async () => {
    const { view } = setup(<RichTextEditor value={null} onChange={() => undefined} />)
    await editingArea(view.container)
    fireEvent.click(await screen.findByRole('button', { name: 'Insert' }))
    for (const name of ['Table', 'Callout', 'Video']) {
      expect(screen.queryAllByText(new RegExp(name, 'i')).length).toBeGreaterThan(0)
    }
  })
})
