/**
 * API entry point. Picks the real HTTP clients when VITE_API_URL is set,
 * otherwise the mocks. Components import `api` / `authApi` from here and never
 * see which one they got.
 */
import type { AuthApi } from './auth'
import type { VerdiktApi } from './client'
import { createHttpApi } from './http'
import { createHttpAuthApi } from './httpAuth'
import { mockApi } from './mock'
import { mockAuthApi } from './mockAuth'

// Set VITE_API_URL (see .env.example) to use the real backend.
const baseUrl = import.meta.env.VITE_API_URL as string | undefined

export const api: VerdiktApi = baseUrl ? createHttpApi(baseUrl) : mockApi
export const authApi: AuthApi = baseUrl ? createHttpAuthApi(baseUrl) : mockAuthApi
export const usingMockData = !baseUrl

export type { VerdiktApi } from './client'
export type { AuthApi, AuthRole, AuthUser, LoginInput, RegisterInput } from './auth'
export { ApiError } from './unwrap'
export * from './types'
