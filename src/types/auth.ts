export type AuthHeaders = Record<string, string>

export interface ClientInfo {
  client_id?: string
  redirect_uri?: string
  scopes?: string[]
  metadata?: Record<string, unknown>
}

export interface OAuthDelegation {
  type: 'oauth_delegation'
  auth_endpoint: string
  token_endpoint: string
  client_info: ClientInfo
  required_scopes: string[]
  redirect_after_auth: boolean
}

export interface OAuthToken {
  access_token: string
  refresh_token?: string
  expires_at: number // epoch millis
  scope: string[]
  user_info?: unknown
}

export interface AuthInfo {
  type: 'bearer'
  token: string
}

export interface TokenValidationResult {
  valid: boolean
  expiresAt?: number
  scopes?: string[]
  error?: string
}

export interface UserInfo {
  id: string
  name?: string
  email?: string
  avatarUrl?: string
  [key: string]: unknown
}

