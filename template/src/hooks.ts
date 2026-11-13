import { onChange } from 'kiln-cms'

/**
 * Change hooks: code that runs after content is created, updated, deleted, published or unpublished.
 * Register each handler here with `onChange`. See docs/recipes/add-hook.md.
 *
 * Example: tell the frontend to rebuild when a post goes live.
 *
 *   onChange(async (event) => {
 *     if (event.resource !== 'posts' || event.action !== 'published') return
 *     await fetch('https://example.com/api/revalidate', { method: 'POST', body: JSON.stringify(event) })
 *   })
 */
export function registerHooks(): void {
  // Keeps the import in use while no handler is registered. Remove it with your first `onChange(...)` call.
  void onChange
}
