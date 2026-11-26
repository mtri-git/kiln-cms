import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Copy, FileText, Search, Trash2, Upload } from 'lucide-react'
import { type DragEvent, useRef, useState } from 'react'
import { ApiError, type Media } from '../api/client'
import { useAdmin, useToast } from '../context'
import { formatBytes, formatDate, readImageSize, useDebounced } from '../hooks'
import { Button, Centered, ConfirmDialog, cx, FieldShell, IconButton, Input, Modal, Spinner } from '../ui'

const PAGE_SIZE = 24
const isImage = (media: Media) => media.contentType.startsWith('image/')

/**
 * The media library. Without `onSelect` it manages files (click a file to edit or delete it).
 * With `onSelect` it is a picker: clicking a file chooses it.
 */
export function MediaLibrary({ onSelect }: { onSelect?: (media: Media) => void }) {
  const { client } = useAdmin()
  const toast = useToast()
  const queryClient = useQueryClient()
  const fileInput = useRef<HTMLInputElement>(null)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [dragging, setDragging] = useState(false)
  const [detail, setDetail] = useState<Media | null>(null)
  const debouncedSearch = useDebounced(search)

  const list = useQuery({
    queryKey: ['media', page, debouncedSearch],
    queryFn: () => client.list<Media>('/admin/media', { page, limit: PAGE_SIZE, search: debouncedSearch }),
    placeholderData: keepPreviousData,
  })

  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      for (const file of files) {
        const size = await readImageSize(file)
        await client.upload(file, size ?? {})
      }
      return files.length
    },
    onSuccess: (count) => {
      toast(count === 1 ? 'File uploaded' : `${count} files uploaded`)
      setPage(1)
      void queryClient.invalidateQueries({ queryKey: ['media'] })
    },
    onError: (error) => {
      toast(error instanceof ApiError ? error.message : 'Upload failed', 'error')
      void queryClient.invalidateQueries({ queryKey: ['media'] })
    },
  })

  const pickFiles = (files: FileList | File[] | null) => {
    const selected = files ? Array.from(files) : []
    if (selected.length > 0) upload.mutate(selected)
  }

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    pickFiles(event.dataTransfer.files)
  }

  const items = list.data?.data ?? []
  const pagination = list.data?.pagination

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a file drop zone; the Upload button is the keyboard path
    <section
      className="flex flex-col gap-4"
      onDragOver={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false)
      }}
      onDrop={onDrop}
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted" />
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
            }}
            placeholder="Search files"
            aria-label="Search files"
            className="pl-8"
          />
        </div>
        <div className="flex-1" />
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          accept="image/*,application/pdf"
          onChange={(event) => {
            pickFiles(event.target.files)
            event.target.value = ''
          }}
        />
        <Button variant="primary" loading={upload.isPending} onClick={() => fileInput.current?.click()}>
          <Upload className="size-4" />
          Upload
        </Button>
      </div>

      <div
        className={cx(
          'relative min-h-48 rounded-xl border border-dashed p-3 transition-colors',
          dragging ? 'border-accent bg-accent/5' : 'border-line',
        )}
      >
        {list.isLoading ? (
          <Centered>
            <Spinner /> Loading…
          </Centered>
        ) : list.isError ? (
          <Centered>Could not load the media library.</Centered>
        ) : items.length === 0 ? (
          <Centered>{debouncedSearch ? 'No files match your search.' : 'Drop files here or press Upload.'}</Centered>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {items.map((media) => (
              <li key={media.id}>
                <button
                  type="button"
                  onClick={() => (onSelect ? onSelect(media) : setDetail(media))}
                  className="group block w-full overflow-hidden rounded-lg border border-line bg-surface text-left transition-shadow hover:shadow-md focus-visible:shadow-md"
                >
                  <div className="flex aspect-square items-center justify-center overflow-hidden bg-subtle">
                    {isImage(media) ? (
                      <img
                        src={media.url}
                        alt={media.alt ?? media.fileName}
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    ) : (
                      <FileText className="size-8 text-muted" />
                    )}
                  </div>
                  <div className="truncate px-2 py-1.5 text-xs" title={media.fileName}>
                    {media.fileName}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted">
          <span>
            Page {pagination.page} of {pagination.totalPages} · {pagination.total} files
          </span>
          <div className="flex gap-1">
            <IconButton aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              <ChevronLeft className="size-4" />
            </IconButton>
            <IconButton aria-label="Next page" disabled={!pagination.hasMore} onClick={() => setPage(page + 1)}>
              <ChevronRight className="size-4" />
            </IconButton>
          </div>
        </div>
      )}

      {detail && <MediaDetail media={detail} onClose={() => setDetail(null)} />}
    </section>
  )
}

function MediaDetail({ media, onClose }: { media: Media; onClose: () => void }) {
  const { client } = useAdmin()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [alt, setAlt] = useState(media.alt ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const done = () => {
    void queryClient.invalidateQueries({ queryKey: ['media'] })
    onClose()
  }

  const save = useMutation({
    mutationFn: () => client.patch(`/admin/media/${media.id}`, { alt: alt.trim() || null }),
    onSuccess: () => {
      toast('Saved')
      done()
    },
    onError: (error) => toast(error instanceof ApiError ? error.message : 'Could not save', 'error'),
  })

  const remove = useMutation({
    mutationFn: () => client.remove(`/admin/media/${media.id}`),
    onSuccess: () => {
      toast('File deleted')
      done()
    },
    onError: (error) => toast(error instanceof ApiError ? error.message : 'Could not delete', 'error'),
  })

  return (
    <>
      <Modal
        open={!confirmDelete}
        onClose={onClose}
        title={media.fileName}
        wide
        footer={
          <>
            <Button variant="ghost" className="mr-auto text-danger" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-4" />
              Delete
            </Button>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
              Save
            </Button>
          </>
        }
      >
        <div className="grid gap-5 md:grid-cols-[1fr_16rem]">
          <div className="flex max-h-[60vh] items-center justify-center overflow-hidden rounded-lg bg-subtle">
            {isImage(media) ? (
              <img src={media.url} alt={media.alt ?? media.fileName} className="max-h-[60vh] object-contain" />
            ) : (
              <FileText className="my-16 size-12 text-muted" />
            )}
          </div>
          <div className="flex flex-col gap-4">
            <FieldShell label="Alt text" description="Describes the image for screen readers and search engines.">
              {(props) => <Input {...props} value={alt} maxLength={500} onChange={(e) => setAlt(e.target.value)} />}
            </FieldShell>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-muted">Type</dt>
              <dd>{media.contentType}</dd>
              <dt className="text-muted">Size</dt>
              <dd>{formatBytes(media.size)}</dd>
              {media.width && media.height && (
                <>
                  <dt className="text-muted">Dimensions</dt>
                  <dd>
                    {media.width} × {media.height}
                  </dd>
                </>
              )}
              <dt className="text-muted">Uploaded</dt>
              <dd>{formatDate(media.createdAt)}</dd>
            </dl>
            <Button
              size="sm"
              onClick={() => {
                void navigator.clipboard?.writeText(media.url).then(() => toast('URL copied'))
              }}
            >
              <Copy className="size-3.5" />
              Copy URL
            </Button>
          </div>
        </div>
      </Modal>
      <ConfirmDialog
        open={confirmDelete}
        title="Delete this file?"
        description="The file is removed from storage. Content that still points at it will show a broken image."
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
        onClose={() => setConfirmDelete(false)}
      />
    </>
  )
}
