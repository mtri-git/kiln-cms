import { type AnchorHTMLAttributes, useCallback, useSyncExternalStore } from 'react'

/**
 * A tiny hash router: the admin lives at `#/posts/123`, so it works on any static host
 * and does not touch the router of the page it is mounted in.
 */

const subscribe = (callback: () => void) => {
  window.addEventListener('hashchange', callback)
  return () => window.removeEventListener('hashchange', callback)
}

const getPath = () => {
  const hash = window.location.hash.replace(/^#/, '')
  const path = hash.split('?')[0]
  return path.startsWith('/') ? path : `/${path}`
}

export function usePath(): string {
  return useSyncExternalStore(subscribe, getPath, () => '/')
}

export function useNavigate() {
  return useCallback((to: string) => {
    window.location.hash = to
  }, [])
}

export function Link({ to, ...props }: { to: string } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
  return <a href={`#${to}`} {...props} />
}

/** `/posts/123` -> `['posts', '123']` */
export const segments = (path: string) => path.split('/').filter(Boolean).map(decodeURIComponent)
