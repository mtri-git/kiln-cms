import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Image as ImageIcon, LayoutDashboard, LogOut, Menu as MenuIcon, X } from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { type ApiClient, createApiClient, type User } from './api/client'
import { AdminContext, PortalRootContext, ToastProvider, useAdmin } from './context'
import { MediaLibrary } from './media/media-library'
import { Dashboard } from './pages/dashboard'
import { GlobalEdit } from './pages/global-edit'
import { LoginPage } from './pages/login'
import { ResourceEdit } from './pages/resource-edit'
import { ResourceList } from './pages/resource-list'
import type { Global, Resource } from './resource'
import { Link, segments, usePath } from './router'
import { Centered, cx, IconButton, Spinner } from './ui'

export type AdminAppProps = {
  /** Base URL of the Kiln API, e.g. `https://api.example.com`. Empty: the same origin as the page. */
  apiUrl?: string
  /** What the admin manages. Each resource gets a menu entry, a list and a form. */
  resources: Resource[]
  /** Single documents such as site settings. Each gets a menu entry and a form. */
  globals?: Global[]
  /** Name shown in the sidebar and on the sign-in page. Default `Kiln`. */
  title?: string
  /** Show the media library. Default `true`. */
  media?: boolean
  /** Force a theme. By default it follows the system setting. */
  theme?: 'light' | 'dark'
  /** localStorage key for the session. Change it when two admins share one origin. */
  storageKey?: string
  className?: string
}

type Session = { status: 'checking' } | { status: 'anonymous' } | { status: 'signed-in'; user: User }

export function AdminApp({
  apiUrl = '',
  resources,
  globals = [],
  title = 'Kiln',
  media = true,
  theme,
  storageKey,
  className,
}: AdminAppProps) {
  const [root, setRoot] = useState<HTMLElement | null>(null)
  const [session, setSession] = useState<Session>({ status: 'checking' })
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, staleTime: 15_000 } },
      }),
    [],
  )

  // The client reports a lost session through this ref, so it can be created once.
  const signedOut = useRef(() => {})
  signedOut.current = () => {
    queryClient.clear()
    setSession({ status: 'anonymous' })
  }
  const client = useMemo(
    () => createApiClient({ baseUrl: apiUrl, storageKey, onSignedOut: () => signedOut.current() }),
    [apiUrl, storageKey],
  )

  useEffect(() => {
    if (!client.hasSession()) {
      setSession({ status: 'anonymous' })
      return
    }
    let cancelled = false
    client
      .me()
      .then((user) => !cancelled && setSession({ status: 'signed-in', user }))
      .catch(() => !cancelled && setSession({ status: 'anonymous' }))
    return () => {
      cancelled = true
    }
  }, [client])

  const signOut = () => {
    void client.logout()
    queryClient.clear()
    setSession({ status: 'anonymous' })
  }

  let content: ReactNode
  if (session.status === 'checking') {
    content = (
      <Centered>
        <Spinner /> Loading…
      </Centered>
    )
  } else if (session.status === 'anonymous') {
    content = (
      <LoginPage client={client} title={title} onSignedIn={(user) => setSession({ status: 'signed-in', user })} />
    )
  } else {
    content = (
      <AdminContext.Provider value={{ client, resources, globals, user: session.user, signOut }}>
        <Shell title={title} media={media} />
      </AdminContext.Provider>
    )
  }

  return (
    <div ref={setRoot} data-theme={theme} className={cx('kiln-admin min-h-dvh', className)}>
      <PortalRootContext.Provider value={root}>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>{content}</ToastProvider>
        </QueryClientProvider>
      </PortalRootContext.Provider>
    </div>
  )
}

function Shell({ title, media }: { title: string; media: boolean }) {
  const path = usePath()
  const [navOpen, setNavOpen] = useState(false)

  // Close the mobile menu after a navigation.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `path` is the trigger
  useEffect(() => setNavOpen(false), [path])

  return (
    <div className="md:grid md:min-h-dvh md:grid-cols-[15rem_minmax(0,1fr)]">
      <header className="flex items-center gap-2 border-b border-line bg-surface px-3 py-2 md:hidden">
        <IconButton aria-label="Open menu" onClick={() => setNavOpen(true)}>
          <MenuIcon className="size-5" />
        </IconButton>
        <span className="font-semibold">{title}</span>
      </header>

      {navOpen && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setNavOpen(false)}
        />
      )}
      <aside
        className={cx(
          'fixed inset-y-0 left-0 z-40 w-60 -translate-x-full border-r border-line bg-surface transition-transform md:sticky md:top-0 md:h-dvh md:translate-x-0',
          navOpen && 'translate-x-0',
        )}
      >
        <Sidebar title={title} media={media} onClose={() => setNavOpen(false)} />
      </aside>

      <main className="min-w-0 p-4 md:p-8">
        <div className="mx-auto max-w-6xl">
          <Routes media={media} />
        </div>
      </main>
    </div>
  )
}

function Sidebar({ title, media, onClose }: { title: string; media: boolean; onClose: () => void }) {
  const path = usePath()
  const [first, second] = segments(path)
  const { resources, globals, user, signOut } = useAdmin()

  type Entry = { key: string; label: string; to: string; active: boolean }
  const groups = new Map<string, Entry[]>()
  const add = (group: string, entry: Entry) => groups.set(group, [...(groups.get(group) ?? []), entry])
  for (const resource of resources) {
    add(resource.group ?? '', {
      key: resource.name,
      label: resource.label,
      to: `/${resource.name}`,
      active: first === resource.name,
    })
  }
  for (const global of globals) {
    add(global.group ?? 'Settings', {
      key: `globals/${global.name}`,
      label: global.label,
      to: `/globals/${global.name}`,
      active: first === 'globals' && second === global.name,
    })
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center justify-between px-4">
        <Link to="/" className="text-base font-semibold">
          {title}
        </Link>
        <IconButton aria-label="Close menu" className="md:hidden" onClick={onClose}>
          <X className="size-4" />
        </IconButton>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-4" aria-label="Main">
        <NavItem to="/" active={first === undefined} icon={<LayoutDashboard className="size-4" />}>
          Dashboard
        </NavItem>
        {[...groups.entries()].map(([group, items]) => (
          <div key={group} className="mt-4">
            {group && <p className="px-2.5 pb-1 text-xs font-medium text-muted">{group}</p>}
            {items.map((entry) => (
              <NavItem key={entry.key} to={entry.to} active={entry.active}>
                {entry.label}
              </NavItem>
            ))}
          </div>
        ))}
        {media && (
          <div className="mt-4">
            <NavItem to="/media" active={first === 'media'} icon={<ImageIcon className="size-4" />}>
              Media
            </NavItem>
          </div>
        )}
      </nav>

      <div className="flex items-center gap-2 border-t border-line p-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{user.fullName}</p>
          <p className="truncate text-xs text-muted">{user.email}</p>
        </div>
        <IconButton aria-label="Sign out" title="Sign out" onClick={signOut}>
          <LogOut className="size-4" />
        </IconButton>
      </div>
    </div>
  )
}

function NavItem({
  to,
  active,
  icon,
  children,
}: {
  to: string
  active: boolean
  icon?: ReactNode
  children: ReactNode
}) {
  return (
    <Link
      to={to}
      aria-current={active ? 'page' : undefined}
      className={cx(
        'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors',
        active ? 'bg-subtle font-medium text-ink' : 'text-muted hover:bg-subtle/70 hover:text-ink',
      )}
    >
      {icon}
      {children}
    </Link>
  )
}

function Routes({ media }: { media: boolean }) {
  const path = usePath()
  const [name, id] = segments(path)
  const { resources, globals } = useAdmin()

  if (!name) return <Dashboard media={media} />
  if (name === 'globals') {
    const global = globals.find((candidate) => candidate.name === id)
    return global ? <GlobalEdit key={global.name} global={global} /> : <NotFound />
  }
  if (name === 'media' && media) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold">Media</h1>
        <MediaLibrary />
      </div>
    )
  }

  const resource = resources.find((candidate) => candidate.name === name)
  if (!resource) return <NotFound />
  return id ? <ResourceEdit key={`${name}/${id}`} resource={resource} id={id} /> : <ResourceList resource={resource} />
}

function NotFound() {
  return (
    <div className="flex flex-col items-start gap-2">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <Link to="/" className="text-sm text-accent hover:underline">
        Back to the dashboard
      </Link>
    </div>
  )
}

export type { ApiClient }
