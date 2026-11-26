import { useQuery } from '@tanstack/react-query'
import { Image as ImageIcon } from 'lucide-react'
import { useAdmin } from '../context'
import type { Resource } from '../resource'
import { Link } from '../router'
import { Card } from '../ui'

export function Dashboard({ media }: { media: boolean }) {
  const { resources, user } = useAdmin()
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Hello, {user.fullName.split(' ')[0]}</h1>
        <p className="mt-1 text-sm text-muted">What would you like to work on?</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {resources.map((resource) => (
          <ResourceCard key={resource.name} resource={resource} />
        ))}
        {media && (
          <Link to="/media">
            <Card className="flex h-full items-center gap-3 p-4 transition-shadow hover:shadow-md">
              <ImageIcon className="size-5 text-muted" />
              <span className="font-medium">Media</span>
            </Card>
          </Link>
        )}
      </div>
    </div>
  )
}

function ResourceCard({ resource }: { resource: Resource }) {
  const { client } = useAdmin()
  // A page of one row is enough to read the total from.
  const count = useQuery({
    queryKey: ['count', resource.name],
    queryFn: async () => (await client.list(resource.path, { limit: 1 })).pagination.total,
  })
  return (
    <Link to={`/${resource.name}`}>
      <Card className="flex h-full flex-col gap-1 p-4 transition-shadow hover:shadow-md">
        <span className="text-2xl font-semibold tabular-nums">{count.data ?? '–'}</span>
        <span className="text-sm text-muted">{resource.label}</span>
      </Card>
    </Link>
  )
}
