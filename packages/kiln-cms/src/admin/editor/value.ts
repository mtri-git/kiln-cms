import type { Content, JSONContent, TiptapEditor } from 'cheese-editor'

/** What a `richtext` field stores: `json` is the document object, `html` is a string. */
export type RichTextFormat = 'json' | 'html'

/** A saved value: a document, an HTML string, or `null` when the editor is empty. */
export type RichTextValue = JSONContent | string | null

/**
 * The editor's starting content. The format of the *value* decides how it loads, not the format of the
 * field: a string is HTML and an object is a document, so changing a field's `format` later still opens
 * the content that is already saved. It is written in the new format the next time it is saved.
 */
export function toEditorContent(
  value: RichTextValue | undefined,
  format: RichTextFormat,
): { content: Content | undefined; contentType: 'json' | 'html' } {
  if (value === null || value === undefined || value === '') {
    return { content: undefined, contentType: format }
  }
  if (typeof value === 'string') return { content: value, contentType: 'html' }
  return { content: value, contentType: 'json' }
}

/** The value to save: `null` for an empty document, otherwise the document or its HTML. */
export function fromEditor(
  editor: Pick<TiptapEditor, 'isEmpty' | 'getHTML' | 'getJSON'>,
  format: RichTextFormat,
): RichTextValue {
  if (editor.isEmpty) return null
  return format === 'html' ? editor.getHTML() : editor.getJSON()
}
