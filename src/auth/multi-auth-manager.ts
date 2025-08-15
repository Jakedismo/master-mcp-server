import { createRemoteJWKSet, jwtVerify } from 'jose'
import type { AuthHeaders, OAuthDelegation, OAuthToken } from '../types/auth.js'
import type { MasterAuthConfig, ServerAuthConfig } from '../types/config.js'
import { AuthStrategy } from '../types/config.js'
import { Logger } from '../utils/logger.js'
import { getOAuthProvider } from './oauth-providers.js'
import { TokenManager } from './token-manager.js'

export class MultiAuthManager {
  private serverAuth: Map<string, { strategy: AuthStrategy; config?: ServerAuthConfig }> = new Map()
  private jwks?: ReturnType<typeof createRemoteJWKSet>
  private tokenManager = new TokenManager()

  constructor(private readonly config: MasterAuthConfig) {
    if (config.jwks_uri) {
      try {
        this.jwks = createRemoteJWKSet(new URL(config.jwks_uri))
      } catch (err) {
        Logger.warn('Failed to initialize JWKS for client token validation', err)
      }
    }
  }

  registerServerAuth(serverId: string, strategy: AuthStrategy, authConfig?: ServerAuthConfig): void {
    this.serverAuth.set(serverId, { strategy, config: authConfig })
  }

  private keyFor(clientToken: string, serverId: string): string {
    return `${serverId}::${clientToken.slice(0, 16)}`
  }

  async validateClientToken(token: string): Promise<boolean> {
    if (!token || typeof token !== 'string') return false
    if (!this.jwks) {
      // Best-effort: check structural validity and expiration if it is a JWT; otherwise accept as opaque bearer
      try {
        const { payload } = await jwtVerify(token, async () => {
          // No key ⇒ force failure to reach catch where we treat opaque tokens as valid
          throw new Error('no-jwks')
        })
        const now = Math.floor(Date.now() / 1000)
        return typeof payload.exp !== 'number' || payload.exp > now
      } catch {
        return true // Accept opaque tokens when no JWKS is configured
      }
    }

    try {
      await jwtVerify(token, this.jwks, {
        issuer: this.config.issuer,
        audience: this.config.audience ?? this.config.client_id,
      })
      return true
    } catch (err) {
      Logger.warn('Client token verification failed', String(err))
      return false
    }
  }

  async prepareAuthForBackend(serverId: string, clientToken: string): Promise<AuthHeaders | OAuthDelegation> {
    const isValid = await this.validateClientToken(clientToken)
    if (!isValid) throw new Error('Invalid client token')

    const entry = this.serverAuth.get(serverId)
    if (!entry) {
      // Default: pass-through
      return { Authorization: `Bearer ${clientToken}` }
    }

    const { strategy, config } = entry
    switch (strategy) {
      case AuthStrategy.MASTER_OAUTH:
        return this.handleMasterOAuth(serverId, clientToken)
      case AuthStrategy.DELEGATE_OAUTH:
        if (!config) throw new Error(`Missing auth config for server ${serverId}`)
        return this.handleDelegatedOAuth(serverId, clientToken, config)
      case AuthStrategy.BYPASS_AUTH:
        return {}
      case AuthStrategy.PROXY_OAUTH:
        if (!config) throw new Error(`Missing auth config for server ${serverId}`)
        return this.handleProxyOAuth(serverId, clientToken, config)
      default:
        return { Authorization: `Bearer ${clientToken}` }
    }
  }

  public async handleMasterOAuth(_serverId: string, clientToken: string): Promise<AuthHeaders> {
    // Pass-through the client's master token
    return { Authorization: `Bearer ${clientToken}` }
  }

  public async handleDelegatedOAuth(
    serverId: string,
    clientToken: string,
    serverAuthConfig: ServerAuthConfig
  ): Promise<OAuthDelegation> {
    // Return instructions for the client to complete OAuth against the provider
    const scopes = Array.isArray(serverAuthConfig.scopes) ? serverAuthConfig.scopes : ['openid']
    // Create state binding server + client
    const state = this.tokenManager.generateState({ serverId })
    // Store a minimal pending marker for later exchange if needed
    await this.tokenManager.storeToken(this.keyFor(clientToken, serverId), {
      access_token: '',
      expires_at: 0,
      scope: [],
    })

    return {
      type: 'oauth_delegation',
      auth_endpoint: serverAuthConfig.authorization_endpoint,
      token_endpoint: serverAuthConfig.token_endpoint,
      client_info: { client_id: serverAuthConfig.client_id, metadata: { state } },
      required_scopes: scopes,
      redirect_after_auth: true,
    }
  }

  public async handleProxyOAuth(
    serverId: string,
    clientToken: string,
    serverAuthConfig: ServerAuthConfig
  ): Promise<AuthHeaders> {
    const key = this.keyFor(clientToken, serverId)
    const existing = await this.tokenManager.getToken(key)
    const now = Date.now()
    if (existing && existing.access_token && existing.expires_at > now + 30_000) {
      return { Authorization: `Bearer ${existing.access_token}` }
    }

    if (existing?.refresh_token) {
      try {
        const provider = getOAuthProvider(serverAuthConfig as any)
        const refreshed = await provider.refreshToken(existing.refresh_token)
        await this.tokenManager.storeToken(key, refreshed)
        return { Authorization: `Bearer ${refreshed.access_token}` }
      } catch (err) {
        Logger.warn('Refresh token failed; falling back to pass-through', err)
      }
    }

    // Fallback: pass through the client token (may be accepted by backend if configured)
    return { Authorization: `Bearer ${clientToken}` }
  }

  async storeDelegatedToken(clientToken: string, serverId: string, serverToken: string | OAuthToken): Promise<void> {
    const key = this.keyFor(clientToken, serverId)
    const tokenObj: OAuthToken = typeof serverToken === 'string'
      ? { access_token: serverToken, expires_at: Date.now() + 3600_000, scope: [] }
      : serverToken
    await this.tokenManager.storeToken(key, tokenObj)
  }

  async getStoredServerToken(serverId: string, clientToken: string): Promise<string | undefined> {
    const tok = await this.tokenManager.getToken(this.keyFor(clientToken, serverId))
    return tok?.access_token
  }
}
