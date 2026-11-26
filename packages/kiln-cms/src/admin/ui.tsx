import { Dialog } from '@base-ui/react/dialog'
import { Select } from '@base-ui/react/select'
import { Switch as BaseSwitch } from '@base-ui/react/switch'
import { Check, ChevronsUpDown, Loader2, X } from 'lucide-react'
import {
  type ButtonHTMLAttributes,
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
  useId,
} from 'react'
import { usePortalRoot } from './context'
import type { SelectOption } from './resource'

export const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ')

// ---- Button ----------------------------------------------------------------

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
  loading?: boolean
}

const variants = {
  primary: 'bg-accent text-accent-ink hover:opacity-90',
  secondary: 'border border-line bg-surface text-ink hover:bg-subtle',
  ghost: 'text-muted hover:bg-subtle hover:text-ink',
  danger: 'bg-danger text-white hover:opacity-90',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, className, children, disabled, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors disabled:opacity-50',
        size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-9 px-3.5 text-sm',
        variants[variant],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="size-3.5 animate-spin" />}
      {children}
    </button>
  )
})

export function IconButton({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cx(
        'inline-flex size-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-subtle hover:text-ink disabled:opacity-40',
        className,
      )}
      {...props}
    />
  )
}

// ---- Inputs ----------------------------------------------------------------

const inputClass =
  'w-full rounded-md border border-line bg-surface px-3 text-sm text-ink placeholder:text-muted/70 disabled:cursor-not-allowed disabled:bg-subtle disabled:text-muted aria-invalid:border-danger'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={cx(inputClass, 'h-9', className)} {...props} />
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...props },
  ref,
) {
  return <textarea ref={ref} className={cx(inputClass, 'py-2', className)} {...props} />
})

/** Label, control, hint and error, wired together with ids. */
export function FieldShell({
  label,
  description,
  error,
  required,
  children,
}: {
  label: string
  description?: string
  error?: string
  required?: boolean
  children: (props: { id: string; 'aria-invalid': boolean; 'aria-describedby'?: string }) => ReactNode
}) {
  const id = useId()
  const hintId = `${id}-hint`
  const hint = error ?? description
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </label>
      {children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': hint ? hintId : undefined })}
      {hint && (
        <p id={hintId} className={cx('text-xs', error ? 'text-danger' : 'text-muted')}>
          {hint}
        </p>
      )}
    </div>
  )
}

export function Switch({
  checked,
  onChange,
  id,
  disabled,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  id?: string
  disabled?: boolean
}) {
  return (
    <BaseSwitch.Root
      id={id}
      checked={checked}
      onCheckedChange={onChange}
      disabled={disabled}
      className="flex h-5 w-9 shrink-0 items-center rounded-full bg-line p-0.5 transition-colors data-checked:bg-accent data-disabled:opacity-50"
    >
      <BaseSwitch.Thumb className="size-4 rounded-full bg-white shadow transition-transform data-checked:translate-x-4" />
    </BaseSwitch.Root>
  )
}

// ---- Select ----------------------------------------------------------------

const NONE = '__none__'

export function SelectBox({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  allowEmpty = true,
  id,
  disabled,
  className,
}: {
  value: string | null
  onChange: (value: string | null) => void
  options: SelectOption[]
  placeholder?: string
  /** Add an entry that clears the value. */
  allowEmpty?: boolean
  id?: string
  disabled?: boolean
  className?: string
}) {
  const items = allowEmpty ? [{ value: NONE, label: placeholder }, ...options] : options
  const root = usePortalRoot()
  return (
    <Select.Root
      items={items}
      value={value ?? (allowEmpty ? NONE : null)}
      onValueChange={(next) => onChange(next === NONE || next === null ? null : String(next))}
      disabled={disabled}
    >
      <Select.Trigger
        id={id}
        className={cx(
          'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-line bg-surface px-3 text-sm disabled:opacity-60 data-popup-open:bg-subtle',
          className,
        )}
      >
        <Select.Value placeholder={placeholder} className="truncate data-placeholder:text-muted" />
        <Select.Icon className="text-muted">
          <ChevronsUpDown className="size-3.5" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal container={root}>
        <Select.Positioner sideOffset={4} className="z-[90] outline-hidden">
          <Select.Popup className="max-h-[var(--available-height)] min-w-[var(--anchor-width)] overflow-y-auto rounded-md border border-line bg-surface py-1 text-ink shadow-lg outline-hidden">
            <Select.List>
              {items.map((item) => (
                <Select.Item
                  key={item.value}
                  value={item.value}
                  className="grid cursor-default grid-cols-[1rem_1fr] items-center gap-2 px-2.5 py-1.5 text-sm outline-hidden select-none data-highlighted:bg-subtle"
                >
                  <Select.ItemIndicator className="col-start-1">
                    <Check className="size-3.5" />
                  </Select.ItemIndicator>
                  <Select.ItemText className={cx('col-start-2', item.value === NONE && 'text-muted')}>
                    {item.label}
                  </Select.ItemText>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  )
}

// ---- Dialog ----------------------------------------------------------------

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  wide,
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children?: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  const root = usePortalRoot()
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal container={root}>
        <Dialog.Backdrop className="fixed inset-0 z-[80] bg-black/40 transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup
          className={cx(
            'fixed top-1/2 left-1/2 z-[85] flex max-h-[calc(100dvh-3rem)] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-line bg-surface text-ink shadow-2xl transition-[scale,opacity] data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0',
            wide ? 'max-w-4xl' : 'max-w-md',
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div>
              <Dialog.Title className="text-base font-semibold">{title}</Dialog.Title>
              {description && (
                <Dialog.Description className="mt-0.5 text-sm text-muted">{description}</Dialog.Description>
              )}
            </div>
            <Dialog.Close render={<IconButton aria-label="Close" />}>
              <X className="size-4" />
            </Dialog.Close>
          </div>
          {children && <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>}
          {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Delete',
  loading,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  description: string
  confirmLabel?: string
  loading?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="danger" loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    />
  )
}

// ---- Small things ----------------------------------------------------------

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'ok' | 'warn' }) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        tone === 'ok' && 'bg-ok/15 text-ok',
        tone === 'warn' && 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
        tone === 'neutral' && 'bg-subtle text-muted',
      )}
    >
      {children}
    </span>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx('size-4 animate-spin text-muted', className)} />
}

export function Centered({ children }: { children: ReactNode }) {
  return <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted">{children}</div>
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('rounded-xl border border-line bg-surface', className)}>{children}</div>
}
