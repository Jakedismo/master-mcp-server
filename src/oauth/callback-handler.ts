import type { MasterConfig, ServerAuthConfig } from '../types/config.js'
import type { OAuthToken } from '../types/auth.js'
import { StateManager, type OAuthStatePayload } from './state-manager.js'
import { PKCEManager } from './pkce-manager.js'

export interface CallbackContext {
  config: MasterConfig
  stateManager: StateManager
  pkceManager: PKCEManager
  baseUrl: string
  // Store token callback: serverId and clientToken must identify the storage key
  storeDelegatedToken?: (clientToken: string, serverId: string, token: OAuthToken) => Promise<void>
}

function toOAuthToken(json: any): OAuthToken {
  const expiresIn = 'expires_in' in json ? Number(json.expires_in) : 3600
  const scope = Array.isArray(json.scope)
    ? (json.scope as string[])
    : typeof json.scope === 'string'
      ? (json.scope as string).split(/[ ,]+/).filter(Boolean)
      : []
  return {
    access_token: String(json.access_token),
    refresh_token: json.refresh_token ? String(json.refresh_token) : undefined,
    expires_at: Date.now() + expiresIn * 1000,
    scope,
  }
}

async function exchangeAuthorizationCode(
  code: string,
  cfg: ServerAuthConfig,
  redirectUri: string,
  codeVerifier: string
): Promise<OAuthToken> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: cfg.client_id,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  })
  if (cfg.client_secret) body.set('client_secret', String(cfg.client_secret))
  const res = await fetch(cfg.token_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Token endpoint error ${res.status}: ${text}`)
  let json: any
  try {
    json = JSON.parse(text)
  } catch {
    json = Object.fromEntries(new URLSearchParams(text))
  }
  return toOAuthToken(json)
}

export class CallbackHandler {
  constructor(private readonly ctx: CallbackContext) {}

  async handleCallback(params: URLSearchParams, providerConfig: ServerAuthConfig): Promise<{ token?: OAuthToken; error?: string; state?: OAuthStatePayload }>
  {
    const error = params.get('error')
    if (error) {
      const desc = params.get('error_description') ?? 'OAuth authorization failed'
      return { error: `${error}: ${desc}` }
    }
    const stateStr = params.get('state')
    const code = params.get('code')
    if (!stateStr || !code) return { error: 'Missing state or code' }

    const state = this.ctx.stateManager.consume(stateStr)
    if (!state) return { error: 'Invalid or expired state' }

    const verifier = this.ctx.pkceManager.getVerifier(stateStr)
    if (!verifier) return { error: 'PKCE verification failed' }

    const redirectUri = new URL('/oauth/callback', this.ctx.baseUrl).toString()
    try {
      const token = await exchangeAuthorizationCode(code, providerConfig, redirectUri, verifier)
      // Store if we can identify a client + server context
      if (state.clientToken && state.serverId && this.ctx.storeDelegatedToken) {
        await this.ctx.storeDelegatedToken(state.clientToken, state.serverId, token)
      }
      return { token, state }
    } catch (err: any) {
      return { error: err?.message ?? 'Token exchange failed' }
    }
  }
}

