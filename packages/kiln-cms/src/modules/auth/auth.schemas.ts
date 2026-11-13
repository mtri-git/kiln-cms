import { z } from '@hono/zod-openapi'
import { userSchema } from '../users/users.schemas'

export const setupSchema = z
  .object({
    email: z.string().email().max(255),
    password: z.string().min(8).max(128),
    fullName: z.string().min(1).max(255),
  })
  .openapi('Setup')

export const loginSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(1),
  })
  .openapi('Login')

export const refreshTokenSchema = z
  .object({
    refreshToken: z.string().min(1),
  })
  .openapi('RefreshToken')

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8).max(128),
  })
  .openapi('ChangePassword')

export const tokensSchema = z
  .object({
    accessToken: z.string(),
    refreshToken: z.string(),
  })
  .openapi('Tokens')

export const authResultSchema = tokensSchema.extend({ user: userSchema }).openapi('AuthResult')

export const loggedOutSchema = z.object({ loggedOut: z.literal(true) }).openapi('LoggedOut')

export type SetupInput = z.infer<typeof setupSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
