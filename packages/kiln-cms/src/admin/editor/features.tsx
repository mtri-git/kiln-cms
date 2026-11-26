import { basicKit, defineFeature, type EditorFeature, ToolbarButton } from 'cheese-editor'
import { callout } from 'cheese-editor/callout'
import { codeBlock } from 'cheese-editor/code-block'
import { details } from 'cheese-editor/details'
import { image } from 'cheese-editor/image'
import { table } from 'cheese-editor/table'
import { video } from 'cheese-editor/video'
import { Images } from 'lucide-react'

/** Max size of an image the editor uploads: the limit of the template's media module. */
export const MAX_IMAGE_SIZE = 10 * 1024 * 1024

/** "Image from library": a toolbar entry (inside the Insert menu) and a slash command. */
function mediaLibrary(open: () => void): EditorFeature {
  return defineFeature({
    name: 'mediaLibrary',
    toolbar: [
      {
        id: 'mediaLibrary',
        group: 'insert',
        render: ({ editor }) => (
          <ToolbarButton icon={Images} title="Media library" disabled={!editor.isEditable} onClick={open} />
        ),
      },
    ],
    slash: [
      {
        id: 'mediaLibrary',
        title: 'Image from library',
        description: 'Choose an uploaded file',
        icon: Images,
        group: 'Media',
        keywords: ['media', 'library', 'picture', 'photo', 'image'],
        command: ({ editor, range }) => {
          editor.chain().focus().deleteRange(range).run()
          open()
        },
      },
    ],
  })
}

export type AdminFeatureOptions = {
  /** Upload a file to the media module and resolve with its public URL. */
  upload: (file: File) => Promise<string>
  onError: (error: Error) => void
  /** Open the media library to pick an image that is already uploaded. */
  openMediaLibrary: () => void
}

/**
 * The features of the admin's rich text editor. Everything the editor can produce is rendered by
 * `cheese-editor/render`, so a frontend shows what the admin saved.
 */
export function createAdminFeatures({ upload, onError, openMediaLibrary }: AdminFeatureOptions): EditorFeature[] {
  return [
    // Headings 1 to 4, as the admin always offered.
    ...basicKit({ heading: [1, 2, 3, 4] }),
    image({ upload, onError, maxSize: MAX_IMAGE_SIZE }),
    table(),
    codeBlock(),
    callout(),
    details(),
    video(),
    mediaLibrary(openMediaLibrary),
  ]
}
