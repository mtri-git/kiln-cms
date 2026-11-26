import { defineResource, usersResource } from '../src/admin'

// This is what an app using kiln-admin writes: one definition per module of its API.
// It matches the posts, categories and tags modules of `template/`.

const seoFields = [
  { name: 'metaTitle', label: 'Meta title', type: 'text', maxLength: 255, position: 'sidebar' },
  {
    name: 'metaDescription',
    label: 'Meta description',
    type: 'textarea',
    rows: 3,
    maxLength: 500,
    position: 'sidebar',
  },
  { name: 'metaKeywords', label: 'Meta keywords', type: 'text', maxLength: 500, position: 'sidebar' },
] as const

export const categories = defineResource({
  name: 'categories',
  label: 'Categories',
  singular: 'Category',
  group: 'Content',
  path: '/admin/categories',
  titleField: 'name',
  columns: ['name', 'slug', { name: 'order', label: 'Order' }, 'updatedAt'],
  fields: [
    { name: 'name', type: 'text', required: true, maxLength: 255 },
    { name: 'slug', type: 'slug', from: 'name', required: true },
    { name: 'description', type: 'textarea' },
    { name: 'imageUrl', label: 'Image', type: 'image', position: 'sidebar' },
    { name: 'order', type: 'number', integer: true, position: 'sidebar' },
    ...seoFields,
  ],
})

export const tags = defineResource({
  name: 'tags',
  label: 'Tags',
  group: 'Content',
  path: '/admin/tags',
  titleField: 'name',
  columns: ['name', 'slug', 'updatedAt'],
  fields: [
    { name: 'name', type: 'text', required: true, maxLength: 255 },
    { name: 'slug', type: 'slug', from: 'name', required: true },
  ],
})

export const posts = defineResource({
  name: 'posts',
  label: 'Posts',
  group: 'Content',
  path: '/admin/posts',
  titleField: 'title',
  columns: [
    'title',
    { name: 'status', type: 'badge' },
    { name: 'category.name', label: 'Category' },
    { name: 'isFeatured', label: 'Featured', type: 'boolean' },
    { name: 'updatedAt', label: 'Updated' },
  ],
  filters: [
    {
      name: 'status',
      label: 'Status',
      options: [
        { value: 'draft', label: 'Draft' },
        { value: 'published', label: 'Published' },
      ],
    },
  ],
  actions: [
    {
      label: 'Publish',
      path: '/{id}/publish',
      variant: 'secondary',
      when: (post) => post.status !== 'published',
      successMessage: 'Post published',
    },
    {
      label: 'Unpublish',
      path: '/{id}/unpublish',
      when: (post) => post.status === 'published',
      successMessage: 'Post is a draft again',
    },
  ],
  fields: [
    { name: 'title', type: 'text', required: true, maxLength: 255 },
    { name: 'excerpt', type: 'textarea', rows: 3 },
    // `format: 'html'` would store a string instead of the Tiptap document.
    { name: 'content', type: 'richtext', format: 'json' },
    { name: 'slug', type: 'slug', from: 'title', required: true, position: 'sidebar' },
    { name: 'coverImageUrl', label: 'Cover image', type: 'image', position: 'sidebar' },
    { name: 'categoryId', label: 'Category', type: 'relation', resource: 'categories', position: 'sidebar' },
    {
      name: 'tagIds',
      label: 'Tags',
      type: 'relation',
      resource: 'tags',
      multiple: true,
      position: 'sidebar',
      read: (post) => (Array.isArray(post.tags) ? post.tags.map((tag: { id: string }) => tag.id) : []),
    },
    { name: 'isFeatured', label: 'Featured', type: 'boolean', position: 'sidebar' },
    ...seoFields,
  ],
})

export const resources = [posts, categories, tags, usersResource]
