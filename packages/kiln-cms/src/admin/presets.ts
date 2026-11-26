import { defineResource } from './resource'

/** The `users` module that comes with `kiln-cms` (`/admin/users`). */
export const usersResource = defineResource({
  name: 'users',
  label: 'Users',
  group: 'Settings',
  path: '/admin/users',
  titleField: 'fullName',
  columns: [
    { name: 'fullName', label: 'Name' },
    { name: 'email' },
    { name: 'role', type: 'badge' },
    { name: 'isActive', label: 'Active', type: 'boolean' },
    { name: 'lastLoginAt', label: 'Last sign-in', type: 'date' },
  ],
  filters: [
    {
      name: 'role',
      label: 'Role',
      options: [
        { value: 'admin', label: 'Admin' },
        { value: 'editor', label: 'Editor' },
      ],
    },
  ],
  fields: [
    { name: 'fullName', label: 'Full name', type: 'text', required: true, maxLength: 255 },
    { name: 'email', type: 'text', inputType: 'email', required: true, readOnlyOnEdit: true },
    {
      name: 'password',
      type: 'text',
      inputType: 'password',
      required: true,
      omitIfEmpty: true,
      description: 'At least 8 characters. On an existing user, leave empty to keep the password.',
    },
    {
      name: 'role',
      type: 'select',
      required: true,
      position: 'sidebar',
      options: [
        { value: 'editor', label: 'Editor' },
        { value: 'admin', label: 'Admin' },
      ],
    },
    { name: 'isActive', label: 'Active', type: 'boolean', position: 'sidebar', mode: 'edit' },
  ],
})
