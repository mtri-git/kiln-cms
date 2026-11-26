import { Editor, type TiptapEditor } from 'cheese-editor'
import { useMemo, useState } from 'react'
import { useAdmin, useToast } from '../context'
import { readImageSize } from '../hooks'
import { MediaPickerDialog } from '../media/media-picker'
import { cx } from '../ui'
import { createAdminFeatures } from './features'
import { fromEditor, type RichTextFormat, type RichTextValue, toEditorContent } from './value'

export type { RichTextFormat, RichTextValue } from './value'

export type RichTextEditorProps = {
  /** The initial document. Later changes of this prop are ignored: give the editor a new `key` to reset it. */
  value: RichTextValue | undefined
  onChange: (value: RichTextValue) => void
  /** What `onChange` receives: the document (`json`, default) or its HTML (`html`). */
  format?: RichTextFormat
  placeholder?: string
  invalid?: boolean
  /** Put on the editing area, so a `<label htmlFor>` and a test can find it. */
  id?: string
  /** Accessible name of the editing area. Default "Rich text editor". */
  label?: string
}

/**
 * The rich text editor of a `richtext` field: cheese-editor with the features a CMS needs, wired to the
 * Kiln media module. Images you paste, drop or pick from your disk are uploaded to `/admin/media`, and
 * "Image from library" inserts one that is already there.
 */
export function RichTextEditor({
  value,
  onChange,
  format = 'json',
  placeholder,
  invalid,
  id,
  label,
}: RichTextEditorProps) {
  const { client } = useAdmin()
  const toast = useToast()
  const [editor, setEditor] = useState<TiptapEditor | null>(null)
  const [picking, setPicking] = useState(false)
  // Read once, like the features: the editor owns its content after it mounts.
  const [initial] = useState(() => toEditorContent(value, format))

  // cheese-editor reads `features` once, so the array must keep its identity.
  const features = useMemo(
    () =>
      createAdminFeatures({
        // The server does not decode images, so the browser sends the size along.
        upload: async (file) => (await client.upload(file, (await readImageSize(file)) ?? {})).url,
        onError: (error) => toast(error.message, 'error'),
        openMediaLibrary: () => setPicking(true),
      }),
    [client, toast],
  )

  return (
    <div className={cx(invalid && '[&_.ce-editor]:border-danger')}>
      <Editor
        features={features}
        content={initial.content}
        contentType={initial.contentType}
        placeholder={placeholder}
        onReady={setEditor}
        onChange={(current) => onChange(fromEditor(current, format))}
        editorOptions={{
          editorProps: {
            // aria-multiline is set here too so it does not depend on the cheese-editor version.
            attributes: { 'aria-label': label ?? 'Rich text editor', 'aria-multiline': 'true', ...(id ? { id } : {}) },
          },
        }}
      />
      <MediaPickerDialog
        open={picking}
        onClose={() => setPicking(false)}
        onPick={(media) => {
          editor
            ?.chain()
            .focus()
            .insertContent({ type: 'image', attrs: { src: media.url, alt: media.alt ?? media.fileName } })
            .run()
          setPicking(false)
        }}
      />
    </div>
  )
}
