import { useCallback, useEffect, useState } from 'react'

export type ThemeChoice = 'system' | 'light' | 'dark'

/** A small per-browser setting in localStorage. Storage can be blocked (private mode), so it falls back to memory. */
export function useStoredState<T extends string>(key: string, initial: T, allowed: readonly T[]) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key) as T | null
      return stored && allowed.includes(stored) ? stored : initial
    } catch {
      return initial
    }
  })
  const update = useCallback(
    (next: T) => {
      setValue(next)
      try {
        localStorage.setItem(key, next)
      } catch {
        // Not saved: the choice lasts until the page reloads.
      }
    },
    [key],
  )
  return [value, update] as const
}

function systemTheme(): 'light' | 'dark' {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** The theme to paint with: the choice, or the system setting when the choice is `system`. */
export function useResolvedTheme(choice: ThemeChoice): 'light' | 'dark' {
  const [system, setSystem] = useState(systemTheme)
  useEffect(() => {
    if (typeof matchMedia !== 'function') return
    const query = matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setSystem(query.matches ? 'dark' : 'light')
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return choice === 'system' ? system : choice
}
