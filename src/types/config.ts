import type { OAuthDelegation } from './auth.js'

export interface MasterConfig {
  master_oauth: MasterOAuthConfig
  servers: ServerConfig[]
  oauth_delegation?: OAuthDelegationConfig
  hosting: HostingConfig
  routing?: RoutingConfig
  logging?: LoggingConfig
  security?: SecurityConfig
}

export interface ServerConfig {
  id: string
  type: 'git' | 'npm' | 'pypi' | 'docker' | 'local'
  url?: string
  package?: string
  version?: string
  branch?: string
  auth_strategy: AuthStrategy
  auth_config?: ServerAuthConfig
  config: {
    environment?: Record<string, string>
    args?: string[]
    port?: number
  }
}

export enum AuthStrategy {
  MASTER_OAUTH = 'master_oauth',
  DELEGATE_OAUTH = 'delegate_oauth',
  BYPASS_AUTH = 'bypass_auth',
  PROXY_OAUTH = 'proxy_oauth'
}

export interface MasterOAuthConfig {
  issuer?: string
  authorization_endpoint: string
  token_endpoint: string
  jwks_uri?: string
  client_id: string
  client_secret?: string
  redirect_uri: string
  scopes: string[]
  audience?: string
}

// Alias used by MultiAuthManager constructor in later phases
export type MasterAuthConfig = MasterOAuthConfig

export interface OAuthDelegationConfig {
  enabled: boolean
  callback_base_url?: string
  // Optional pre-configured providers by ID
  providers?: Record<string, ServerAuthConfig>
}

export interface HostingConfig {
  platform: 'node' | 'cloudflare-workers' | 'koyeb' | 'docker' | 'unknown'
  port?: number
  base_url?: string
  // Optional platform-specific storage/backend hints
  storage_backend?: 'memory' | 'fs' | 'durable_object' | 'kv' | 's3'
}

export interface LoggingConfig {
  level?: 'debug' | 'info' | 'warn' | 'error'
}

export interface SecurityConfig {
  // Env var name containing encryption key for config secrets
  config_key_env?: string
  // Enable audit logging for config changes
  audit?: boolean
  // Optional secret rotation policy in days
  rotation_days?: number
}

export interface ServerAuthConfig {
  provider: 'github' | 'google' | 'custom'
  authorization_endpoint: string
  token_endpoint: string
  client_id: string
  client_secret?: string
  scopes?: string[]
  // Additional provider-specific fields
  [key: string]: unknown
}

// Re-export for convenience in consumers
export type { OAuthDelegation }

// ---- Routing configuration ----
export type LoadBalancingStrategy = 'round_robin' | 'weighted' | 'health'

export interface LoadBalancerConfig {
  strategy?: LoadBalancingStrategy
}

export interface CircuitBreakerConfig {
  failureThreshold?: number
  successThreshold?: number
  recoveryTimeoutMs?: number
}

export interface RetryPolicyConfig {
  maxRetries?: number
  baseDelayMs?: number
  maxDelayMs?: number
  backoffFactor?: number
  jitter?: 'none' | 'full'
  retryOn?: {
    networkErrors?: boolean
    httpStatuses?: number[]
    httpStatusClasses?: Array<4 | 5>
  }
}

export interface RoutingConfig {
  loadBalancer?: LoadBalancerConfig
  circuitBreaker?: CircuitBreakerConfig
  retry?: RetryPolicyConfig
}

// Defaults for consumers that want a baseline configuration
export const DefaultRoutingConfig: RoutingConfig = {
  loadBalancer: { strategy: 'round_robin' },
  circuitBreaker: { failureThreshold: 5, successThreshold: 2, recoveryTimeoutMs: 30_000 },
  retry: { maxRetries: 2, baseDelayMs: 250, maxDelayMs: 4_000, backoffFactor: 2, jitter: 'full' },
}

export const DefaultHostingConfig: HostingConfig = {
  platform: 'node',
  port: 3000,
}
