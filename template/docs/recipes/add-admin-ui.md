# Add an admin UI

For app authors. `kiln-cms/admin` renders an admin for your API: sign-in, lists, forms, media library and a rich text editor. You describe your modules in code. The API does not change.

It lives in the same package as the API, so you add it to the same repo: one `kiln-cms` dependency, two things you run.

## Steps

1. Install what the admin uses. These are optional peers of `kiln-cms`: a headless app never needs them.

   ```sh
   pnpm add react react-dom @base-ui/react @tanstack/react-query lucide-react cheese-editor lowlight
   pnpm add -D vite @vitejs/plugin-react @types/react @types/react-dom
   ```

2. Create the admin in an `admin/` folder next to `src/`:

   `admin/index.html`

   ```html
   <!doctype html>
   <html lang="en">
     <head>
       <meta charset="UTF-8" />
       <meta name="viewport" content="width=device-width, initial-scale=1.0" />
       <title>Admin</title>
     </head>
     <body>
       <div id="root"></div>
       <script type="module" src="./main.tsx"></script>
     </body>
   </html>
   ```

   `admin/main.tsx`

   ```tsx
   import { AdminApp, usersResource } from 'kiln-cms/admin'
   import 'kiln-cms/admin/styles.css'
   import { createRoot } from 'react-dom/client'
   import { categories, posts, tags } from './resources'

   // An empty apiUrl means the same origin as the page: the dev server below proxies the API.
   const root = document.getElementById('root')
   if (!root) throw new Error('#root is missing')
   createRoot(root).render(
     <AdminApp apiUrl={import.meta.env.VITE_API_URL ?? ''} resources={[posts, categories, tags, usersResource]} />,
   )
   ```

   `admin/resources.ts`: one `defineResource` per module of your API. Each lists the fields the module's schemas accept. For the template's posts:

   ```ts
   import { defineResource } from 'kiln-cms/admin'

   export const posts = defineResource({
     name: 'posts',
     label: 'Posts',
     path: '/admin/posts',
     titleField: 'title',
     columns: ['title', { name: 'status', type: 'badge' }, 'updatedAt'],
     fields: [
       { name: 'title', type: 'text', required: true, maxLength: 255 },
       { name: 'content', type: 'richtext', format: 'json' },
       { name: 'slug', type: 'slug', from: 'title', required: true, position: 'sidebar' },
     ],
     actions: [{ label: 'Publish', path: '/{id}/publish', when: (post) => post.status !== 'published' }],
   })
   ```

   Field types, columns, filters and actions are listed in the package [README](../../../packages/kiln-cms/README.md#admin-ui-optional).

3. Add a Vite config for it, `admin/vite.config.ts`. The proxy sends the API's paths to your server, so the browser sees one origin and no CORS setup is needed in development:

   ```ts
   import react from '@vitejs/plugin-react'
   import { defineConfig } from 'vite'

   export default defineConfig({
     root: import.meta.dirname,
     plugins: [react()],
     server: { port: 5173, proxy: { '/auth': 'http://localhost:8787', '/admin': 'http://localhost:8787', '/files': 'http://localhost:8787' } },
     build: { outDir: 'dist', emptyOutDir: true },
   })
   ```

   The admin uses hash routes (`#/posts`), so the page itself never lives under `/admin/`: every request to that path is an API call, and the proxy can forward it.

4. Add scripts to `package.json`:

   ```json
   "dev:admin": "vite --config admin/vite.config.ts",
   "build:admin": "vite build --config admin/vite.config.ts"
   ```

5. Run the API (`pnpm dev` or `pnpm dev:node`), then `pnpm dev:admin` and open http://localhost:5173. On a new database the sign-in page has "First time here? Create the administrator" (`POST /auth/setup`, which works only while there are no users).

## Deploy

`pnpm build:admin` writes a static site to `admin/dist`. Host it anywhere that serves files: it uses hash routes, so it needs no rewrite rules. Build it with `VITE_API_URL=https://api.example.com`, and add the admin's origin to `CORS_ALLOW_LIST` on the API, because the browser now calls another origin.

## Notes

- The admin needs React 19.
- The type check of your app: the admin has its own DOM and JSX settings, so give `admin/` its own `tsconfig.json` (`"jsx": "react-jsx"`, `"lib": ["ES2022", "DOM", "DOM.Iterable"]`) and keep it out of the app's, which targets a Worker or Node.
- To show the content on a site, render the saved JSON with `cheese-editor/render`.
