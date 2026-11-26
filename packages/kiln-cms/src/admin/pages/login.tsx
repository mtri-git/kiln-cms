import { type FormEvent, useState } from 'react'
import { type ApiClient, ApiError, type User } from '../api/client'
import { Button, Card, FieldShell, Input } from '../ui'

export function LoginPage({
  client,
  title,
  onSignedIn,
}: {
  client: ApiClient
  title: string
  onSignedIn: (user: User) => void
}) {
  // `/auth/setup` creates the first admin and only works while the users table is empty.
  const [setup, setSetup] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const user = setup ? await client.setup({ email, password, fullName }) : await client.login(email, password)
      onSignedIn(user)
    } catch (caught) {
      if (caught instanceof ApiError) {
        const first = Object.values(caught.fieldErrors)[0]
        setError(first ?? caught.message)
      } else setError('Could not reach the server.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm p-6 shadow-sm">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-muted">{setup ? 'Create the first administrator.' : 'Sign in to continue.'}</p>
        <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
          {setup && (
            <FieldShell label="Full name" required>
              {(props) => (
                <Input {...props} required value={fullName} onChange={(event) => setFullName(event.target.value)} />
              )}
            </FieldShell>
          )}
          <FieldShell label="Email" required>
            {(props) => (
              <Input
                {...props}
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            )}
          </FieldShell>
          <FieldShell label="Password" required description={setup ? 'At least 8 characters.' : undefined}>
            {(props) => (
              <Input
                {...props}
                type="password"
                required
                minLength={setup ? 8 : undefined}
                autoComplete={setup ? 'new-password' : 'current-password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            )}
          </FieldShell>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" loading={busy} className="w-full">
            {setup ? 'Create account' : 'Sign in'}
          </Button>
        </form>
        <button
          type="button"
          onClick={() => {
            setSetup(!setup)
            setError(null)
          }}
          className="mt-4 w-full text-center text-xs text-muted hover:text-ink"
        >
          {setup ? 'Back to sign in' : 'First time here? Create the administrator'}
        </button>
      </Card>
    </div>
  )
}
