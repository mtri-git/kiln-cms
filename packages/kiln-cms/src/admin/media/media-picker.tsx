import type { Media } from '../api/client'
import { Modal } from '../ui'
import { MediaLibrary } from './media-library'

/** A dialog with the media library in it. Clicking a file calls `onPick`. */
export function MediaPickerDialog({
  open,
  onClose,
  onPick,
}: {
  open: boolean
  onClose: () => void
  onPick: (media: Media) => void
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Choose a file"
      description="Upload a new one or pick from the library."
      wide
    >
      {open && <MediaLibrary onSelect={onPick} />}
    </Modal>
  )
}
