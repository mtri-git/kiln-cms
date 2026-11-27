import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  Image as ImageIcon,
  LayoutDashboard,
  LogOut,
  Menu as MenuIcon,
  Monitor,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  X,
} from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { type ApiClient, createApiClient, type User } from './api/client'
import { AdminContext, PortalRootContext, ToastProvider, useAdmin } from './context'
import { MediaLibrary } from './media/media-library'
import { Dashboard } from './pages/dashboard'
import { GlobalEdit } from './pages/global-edit'
import { LoginPage } from './pages/login'
import { ResourceEdit } from './pages/resource-edit'
import { ResourceList } from './pages/resource-list'
import { type ThemeChoice, useResolvedTheme, useStoredState } from './preferences'
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
  /** Force a theme and hide the theme switch. By default each user picks system, light or dark in the menu. */
  theme?: 'light' | 'dark'
  /** localStorage key for the session, also the prefix of the theme and menu settings. Change it when two admins share one origin. */
  storageKey?: string
  className?: string
}

type Session = { status: 'checking' } | { status: 'anonymous' } | { status: 'signed-in'; user: User }

const THEME_CHOICES = ['system', 'light', 'dark'] as const
const NAV_STATES = ['expanded', 'collapsed'] as const

/** What the theme switch shows, and how it changes the choice. */
type ThemeControl = { choice: ThemeChoice; onChange: (choice: ThemeChoice) => void }

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
  const prefix = storageKey ?? 'kiln-admin'
  const [themeChoice, setThemeChoice] = useStoredState<ThemeChoice>(`${prefix}:theme`, 'system', THEME_CHOICES)
  const resolvedTheme = useResolvedTheme(theme ?? themeChoice)
  const themeControl: ThemeControl | undefined = theme ? undefined : { choice: themeChoice, onChange: setThemeChoice }

  // Menus such as the editor's slash menu are mounted on <body>, outside the admin root, and read this.
  useEffect(() => {
    const html = document.documentElement
    html.dataset.kilnTheme = resolvedTheme
    return () => {
      delete html.dataset.kilnTheme
    }
  }, [resolvedTheme])

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
        <Shell title={title} media={media} storagePrefix={prefix} themeControl={themeControl} />
      </AdminContext.Provider>
    )
  }

  return (
    <div ref={setRoot} data-theme={resolvedTheme} className={cx('kiln-admin min-h-dvh', className)}>
      <PortalRootContext.Provider value={root}>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>{content}</ToastProvider>
        </QueryClientProvider>
      </PortalRootContext.Provider>
    </div>
  )
}

function Shell({
  title,
  media,
  storagePrefix,
  themeControl,
}: {
  title: string
  media: boolean
  storagePrefix: string
  themeControl?: ThemeControl
}) {
  const path = usePath()
  const [navOpen, setNavOpen] = useState(false)
  const [navState, setNavState] = useStoredState(`${storagePrefix}:nav`, 'expanded', NAV_STATES)
  const collapsed = navState === 'collapsed'

  // Close the mobile menu after a navigation.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `path` is the trigger
  useEffect(() => setNavOpen(false), [path])

  return (
    <div
      className={cx(
        'md:grid md:min-h-dvh',
        collapsed ? 'md:grid-cols-[3.5rem_minmax(0,1fr)]' : 'md:grid-cols-[15rem_minmax(0,1fr)]',
      )}
    >
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
          collapsed && 'md:w-14',
          navOpen && 'translate-x-0',
        )}
      >
        <Sidebar
          title={title}
          media={media}
          collapsed={collapsed}
          onToggleCollapsed={() => setNavState(collapsed ? 'expanded' : 'collapsed')}
          themeControl={themeControl}
          onClose={() => setNavOpen(false)}
        />
      </aside>

      <main className="min-w-0 p-4 md:p-8">
        <div className="mx-auto max-w-6xl">
          <Routes media={media} />
        </div>
      </main>
    </div>
  )
}

/*
 * The collapsed state only applies from `md` up: the mobile menu is a drawer and always shows labels,
 * so every collapsed style below carries the `md:` prefix.
 */
function Sidebar({
  title,
  media,
  collapsed,
  onToggleCollapsed,
  themeControl,
  onClose,
}: {
  title: string
  media: boolean
  collapsed: boolean
  onToggleCollapsed: () => void
  themeControl?: ThemeControl
  onClose: () => void
}) {
  const path = usePath()
  const [first, second] = segments(path)
  const { resources, globals, user, signOut } = useAdmin()

  type Entry = { key: string; label: string; to: string; active: boolean; icon?: ReactNode }
  const groups = new Map<string, Entry[]>()
  const add = (group: string, entry: Entry) => groups.set(group, [...(groups.get(group) ?? []), entry])
  for (const resource of resources) {
    add(resource.group ?? '', {
      key: resource.name,
      label: resource.label,
      to: `/${resource.name}`,
      active: first === resource.name,
      icon: resource.icon,
    })
  }
  for (const global of globals) {
    add(global.group ?? 'Settings', {
      key: `globals/${global.name}`,
      label: global.label,
      to: `/globals/${global.name}`,
      active: first === 'globals' && second === global.name,
      icon: global.icon,
    })
  }
  const groupClass = cx('mt-4', collapsed && 'md:mt-2 md:border-t md:border-line md:pt-2')

  return (
    <div className="flex h-full flex-col">
      <div
        className={cx('flex h-14 items-center justify-between gap-1 px-4', collapsed && 'md:justify-center md:px-0')}
      >
        <Link to="/" className={cx('truncate text-base font-semibold', collapsed && 'md:hidden')}>
          {title}
        </Link>
        <IconButton aria-label="Close menu" className="md:hidden" onClick={onClose}>
          <X className="size-4" />
        </IconButton>
        <IconButton
          aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
          title={collapsed ? 'Expand menu' : 'Collapse menu'}
          aria-expanded={!collapsed}
          className="hidden md:inline-flex"
          onClick={onToggleCollapsed}
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        </IconButton>
      </div>

      <nav className={cx('flex-1 overflow-y-auto px-2 pb-4', collapsed && 'md:overflow-x-hidden')} aria-label="Main">
        <NavItem
          to="/"
          label="Dashboard"
          active={first === undefined}
          collapsed={collapsed}
          icon={<LayoutDashboard className="size-4" />}
        />
        {[...groups.entries()].map(([group, items]) => (
          <div key={group} className={groupClass}>
            {group && (
              <p className={cx('px-2.5 pb-1 text-xs font-medium text-muted', collapsed && 'md:hidden')}>{group}</p>
            )}
            {items.map((entry) => (
              <NavItem
                key={entry.key}
                to={entry.to}
                label={entry.label}
                active={entry.active}
                collapsed={collapsed}
                icon={entry.icon}
              />
            ))}
          </div>
        ))}
        {media && (
          <div className={groupClass}>
            <NavItem
              to="/media"
              label="Media"
              active={first === 'media'}
              collapsed={collapsed}
              icon={<ImageIcon className="size-4" />}
            />
          </div>
        )}
      </nav>

      <div className={cx('flex items-center gap-1 border-t border-line p-3', collapsed && 'md:flex-col md:px-0')}>
        <div className={cx('min-w-0 flex-1', collapsed && 'md:hidden')}>
          <p className="truncate text-sm font-medium">{user.fullName}</p>
          <p className="truncate text-xs text-muted">{user.email}</p>
        </div>
        {themeControl && <ThemeSwitch {...themeControl} />}
        <IconButton aria-label="Sign out" title="Sign out" onClick={signOut}>
          <LogOut className="size-4" />
        </IconButton>
      </div>
    </div>
  )
}

const THEME_LABELS: Record<ThemeChoice, string> = { system: 'System', light: 'Light', dark: 'Dark' }
const NEXT_THEME: Record<ThemeChoice, ThemeChoice> = { system: 'light', light: 'dark', dark: 'system' }

/** One button that cycles system → light → dark, so it also fits the collapsed menu. */
function ThemeSwitch({ choice, onChange }: ThemeControl) {
  const Icon = choice === 'light' ? Sun : choice === 'dark' ? Moon : Monitor
  const label = `Theme: ${THEME_LABELS[choice]} (switch to ${THEME_LABELS[NEXT_THEME[choice]]})`
  return (
    <IconButton aria-label={label} title={label} onClick={() => onChange(NEXT_THEME[choice])}>
      <Icon className="size-4" />
    </IconButton>
  )
}

function NavItem({
  to,
  label,
  active,
  collapsed,
  icon,
}: {
  to: string
  label: string
  active: boolean
  collapsed: boolean
  icon?: ReactNode
}) {
  return (
    <Link
      to={to}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? label : undefined}
      className={cx(
        'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors',
        collapsed && 'md:justify-center md:px-0',
        active ? 'bg-subtle font-medium text-ink' : 'text-muted hover:bg-subtle/70 hover:text-ink',
      )}
    >
      {icon ??
        (collapsed && (
          <span aria-hidden className="hidden size-4 items-center justify-center text-xs font-semibold md:flex">
            {label.charAt(0).toUpperCase()}
          </span>
        ))}
      <span className={cx('truncate', collapsed && 'md:sr-only')}>{label}</span>
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
