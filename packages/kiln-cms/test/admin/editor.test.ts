// @vitest-environment happy-dom
import { Editor as TiptapEditor } from '@tiptap/core'
import { FeatureRegistry, type JSONContent, resolveFeatures } from 'cheese-editor'
import { afterEach, describe, expect, test } from 'vitest'
import { createAdminFeatures } from '../../src/admin/editor/features'
import { fromEditor, toEditorContent } from '../../src/admin/editor/value'

const editors: TiptapEditor[] = []

function createEditor(content?: JSONContent | string) {
  const resolved = resolveFeatures(
    createAdminFeatures({ upload: async () => '/x.png', onError: () => undefined, openMediaLibrary: () => undefined }),
  )
  const editor = new TiptapEditor({
    extensions: [...resolved.extensions, FeatureRegistry.configure({ resolved })],
    content,
  })
  editors.push(editor)
  return editor
}

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy()
})

const t = (text: string, marks?: JSONContent['marks']): JSONContent => ({
  type: 'text',
  text,
  ...(marks ? { marks } : {}),
})
const p = (...content: JSONContent[]): JSONContent => ({ type: 'paragraph', content })

/** Every node and mark type in a document. */
function typesIn(node: JSONContent, found = new Set<string>()): Set<string> {
  if (node.type) found.add(node.type)
  for (const mark of node.marks ?? []) found.add(`mark:${mark.type}`)
  for (const child of node.content ?? []) typesIn(child, found)
  return found
}

/**
 * A document with every node and mark the previous admin editor could produce, in the shape it saved
 * them. Opening it must not lose any of them.
 */
const savedByThePreviousEditor: JSONContent = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1, textAlign: 'center' }, content: [t('Title')] },
    { type: 'heading', attrs: { level: 4 }, content: [t('Small heading')] },
    {
      type: 'paragraph',
      attrs: { textAlign: 'right' },
      content: [
        t('bold', [{ type: 'bold' }]),
        t('italic', [{ type: 'italic' }]),
        t('under', [{ type: 'underline' }]),
        t('strike', [{ type: 'strike' }]),
        t('code', [{ type: 'code' }]),
        t('link', [
          { type: 'link', attrs: { href: 'https://x.dev', target: '_blank', rel: 'noopener noreferrer nofollow' } },
        ]),
        t('mark', [{ type: 'highlight' }]),
      ],
    },
    { type: 'blockquote', content: [p(t('quote'))] },
    { type: 'bulletList', content: [{ type: 'listItem', content: [p(t('bullet'))] }] },
    { type: 'orderedList', attrs: { start: 3 }, content: [{ type: 'listItem', content: [p(t('one'))] }] },
    {
      type: 'taskList',
      content: [
        { type: 'taskItem', attrs: { checked: true }, content: [p(t('done'))] },
        { type: 'taskItem', attrs: { checked: false }, content: [p(t('todo'))] },
      ],
    },
    { type: 'codeBlock', attrs: { language: 'ts' }, content: [t('const a = 1')] },
    { type: 'image', attrs: { src: 'https://x.dev/a.png', alt: 'A', title: 'T' } },
    {
      type: 'table',
      content: [
        { type: 'tableRow', content: [{ type: 'tableHeader', attrs: { colspan: 2 }, content: [p(t('Head'))] }] },
        {
          type: 'tableRow',
          content: [
            { type: 'tableCell', content: [p(t('cell'))] },
            { type: 'tableCell', attrs: { rowspan: 2 }, content: [{ type: 'paragraph' }] },
          ],
        },
      ],
    },
    { type: 'horizontalRule' },
    p(t('line one'), { type: 'hardBreak' }, t('line two')),
  ],
}

describe('content saved by the previous editor', () => {
  test('opens without losing a node or a mark', () => {
    const opened = createEditor(savedByThePreviousEditor).getJSON()
    expect([...typesIn(opened)].sort()).toEqual([...typesIn(savedByThePreviousEditor)].sort())
  })

  test('keeps its text', () => {
    const text = createEditor(savedByThePreviousEditor).getText()
    for (const word of [
      'Title',
      'Small heading',
      'bold',
      'quote',
      'bullet',
      'done',
      'const a = 1',
      'Head',
      'cell',
      'line one',
      'line two',
    ]) {
      expect(text).toContain(word)
    }
  })

  test('is stable: saving, then opening what was saved, gives the same document', () => {
    const first = createEditor(savedByThePreviousEditor).getJSON()
    expect(createEditor(first).getJSON()).toEqual(first)
  })

  test('keeps the attributes that matter', () => {
    const opened = createEditor(savedByThePreviousEditor).getJSON()
    const find = (type: string): JSONContent | undefined => (opened.content ?? []).find((node) => node.type === type)
    expect(find('orderedList')?.attrs?.start).toBe(3)
    expect(find('heading')?.attrs).toMatchObject({ level: 1, textAlign: 'center' })
    expect((opened.content ?? []).filter((node) => node.type === 'heading').map((node) => node.attrs?.level)).toEqual([
      1, 4,
    ])
    expect(find('codeBlock')?.attrs?.language).toBe('ts')
    expect(find('image')?.attrs).toMatchObject({ src: 'https://x.dev/a.png', alt: 'A', title: 'T' })
    expect(find('taskList')?.content?.map((item: JSONContent) => item.attrs?.checked)).toEqual([true, false])
  })
})

describe('HTML output of a field with format "html"', () => {
  test('keeps heading levels 1 to 4 (Tiptap writes a level that is not offered as the first one)', () => {
    const html = createEditor(savedByThePreviousEditor).getHTML()
    expect(html).toContain('<h4>Small heading</h4>')
    expect(html).not.toContain('<h1>Small heading')
  })
})

describe('HTML saved by a field with format "html"', () => {
  test('opens as a document', () => {
    const json = createEditor('<p>Hello <strong>world</strong></p><h2>Next</h2>').getJSON()
    expect(typesIn(json)).toEqual(new Set(['doc', 'paragraph', 'text', 'mark:bold', 'heading']))
  })
})

describe('toEditorContent', () => {
  test('a document loads as JSON and a string as HTML, whatever the field format is', () => {
    const doc = { type: 'doc', content: [] }
    expect(toEditorContent(doc, 'json')).toEqual({ content: doc, contentType: 'json' })
    expect(toEditorContent(doc, 'html')).toEqual({ content: doc, contentType: 'json' })
    expect(toEditorContent('<p>x</p>', 'html')).toEqual({ content: '<p>x</p>', contentType: 'html' })
    expect(toEditorContent('<p>x</p>', 'json')).toEqual({ content: '<p>x</p>', contentType: 'html' })
  })

  test('no value starts empty, in the format of the field', () => {
    for (const empty of [null, undefined, '']) {
      expect(toEditorContent(empty, 'json')).toEqual({ content: undefined, contentType: 'json' })
      expect(toEditorContent(empty, 'html')).toEqual({ content: undefined, contentType: 'html' })
    }
  })
})

describe('fromEditor', () => {
  test('an empty editor saves null in both formats', () => {
    const editor = createEditor()
    expect(fromEditor(editor, 'json')).toBeNull()
    expect(fromEditor(editor, 'html')).toBeNull()
  })

  test('saves the document as an object in json and as a string in html', () => {
    const editor = createEditor({ type: 'doc', content: [p(t('Hi', [{ type: 'bold' }]))] })
    const json = fromEditor(editor, 'json')
    expect(typeof json).toBe('object')
    expect(typesIn(json as JSONContent).has('mark:bold')).toBe(true)
    expect(fromEditor(editor, 'html')).toBe('<p><strong>Hi</strong></p>')
  })

  test('a document with only an image is not empty', () => {
    const editor = createEditor({ type: 'doc', content: [{ type: 'image', attrs: { src: '/a.png' } }] })
    expect(fromEditor(editor, 'json')).not.toBeNull()
  })
})

describe('features', () => {
  test('offer the media library in the Insert menu and as a slash command', () => {
    const { slash, toolbar } = resolveFeatures(
      createAdminFeatures({ upload: async () => '', onError: () => undefined, openMediaLibrary: () => undefined }),
    )
    const item = slash.find((entry) => entry.id === 'mediaLibrary')
    expect(item?.group).toBe('Media')
    // Same id as its toolbar entry, so the Insert menu shows it instead of a separate button.
    expect(toolbar.some((entry) => entry.id === 'mediaLibrary')).toBe(true)
  })

  test('uploads go through the function the admin passes in', async () => {
    const calls: string[] = []
    const features = createAdminFeatures({
      upload: async (file) => {
        calls.push(file.name)
        return '/files/a.png'
      },
      onError: () => undefined,
      openMediaLibrary: () => undefined,
    })
    // The image feature is built from `upload`: building the editor must not call it by itself.
    resolveFeatures(features)
    expect(calls).toEqual([])
  })
})

describe('links', () => {
  test('a link gets no nofollow and does not open a new tab by default', () => {
    const editor = createEditor('<p><a href="/pricing">hello</a></p>')
    expect(editor.getJSON().content?.[0]?.content?.[0]?.marks?.[0]?.attrs).toMatchObject({ target: null, rel: null })
    expect(editor.getHTML()).toBe('<p><a href="/pricing">hello</a></p>')
  })
})

describe('HTML blocks', () => {
  test('HTML imported as <div data-type="html-block"> is kept as it was written', () => {
    const raw = '<div class="price"><span>1</span></div>'
    const editor = createEditor(`<div data-type="html-block">${raw}</div>`)
    expect(editor.getJSON().content?.[0]).toMatchObject({ type: 'htmlBlock', attrs: { html: raw } })
  })
})
