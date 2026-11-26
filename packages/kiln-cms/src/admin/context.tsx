import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react'
import type { ApiClient, User } from './api/client'
import type { Resource } from './resource'

export type AdminContextValue = {
  client: ApiClient
  resources: Resource[]
  user: User
  signOut: () => void
}

export const AdminContext = createContext<AdminContextValue | null>(null)

/** The admin's root element. Popups render inside it so they keep the theme variables. */
export const PortalRootContext = createContext<HTMLElement | null>(null)
export const usePortalRoot = () => useContext(PortalRootContext)

export function useAdmin(): AdminContextValue {
  const value = useContext(AdminContext)
  if (!value) throw new Error('useAdmin must be used inside <AdminApp>')
  return value
}

export function useResource(name: string | undefined): Resource | undefined {
  return useAdmin().resources.find((resource) => resource.name === name)
}

// ---- Toasts ----------------------------------------------------------------

type Toast = { id: number; message: string; kind: 'success' | 'error' }
type ToastFn = (message: string, kind?: Toast['kind']) => void

const ToastContext = createContext<ToastFn>(() => undefined)

export const useToast = () => useContext(ToastContext)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const push = useCallback<ToastFn>((message, kind = 'success') => {
    const id = Date.now() + Math.random()
    setToasts((current) => [...current, { id, message, kind }])
    setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 4000)
  }, [])

  const value = useMemo(() => push, [push])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-4 z-[100] flex flex-col gap-2" aria-live="polite">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.kind === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto max-w-sm rounded-md border px-3 py-2 text-sm shadow-lg ${
              toast.kind === 'error' ? 'border-danger/30 bg-surface text-danger' : 'border-line bg-surface text-ink'
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
