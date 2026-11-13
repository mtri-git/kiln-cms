import { z } from '@hono/zod-openapi'
import { USER_ROLES } from '../../core/constants'
import { baseFields, pageQuery, timestamp } from '../../core/openapi'

/** What the API returns for one user. Never contains the password hash. */
export const userSchema = z
  .object({
    ...baseFields,
    email: z.string(),
    fullName: z.string(),
    role: z.enum(USER_ROLES),
    isActive: z.boolean(),
    lastLoginAt: timestamp.nullable(),
  })
  .openapi('User')

export const createUserSchema = z
  .object({
    email: z.string().email().max(255),
    password: z.string().min(8).max(128),
    fullName: z.string().min(1).max(255),
    role: z.enum(USER_ROLES),
  })
  .openapi('CreateUser')

export const updateUserSchema = z
  .object({
    fullName: z.string().min(1).max(255).optional(),
    role: z.enum(USER_ROLES).optional(),
    isActive: z.boolean().optional(),
    password: z.string().min(8).max(128).optional(),
  })
  .openapi('UpdateUser')

export const listUsersQuery = pageQuery.extend({
  search: z.string().min(1).optional(),
  role: z.enum(USER_ROLES).optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
})

export type CreateUserInput = z.infer<typeof createUserSchema>
export type UpdateUserInput = z.infer<typeof updateUserSchema>
export type ListUsersQuery = z.infer<typeof listUsersQuery>
