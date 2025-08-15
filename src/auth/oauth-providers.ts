import fetch from 'node-fetch'
import { createRemoteJWKSet, decodeJwt, jwtVerify } from 'jose'
import type { OAuthToken, TokenValidationResult, UserInfo } from '../types/auth.js'
import type { ServerAuthConfig } from '../types/config.js'
import { Logger } from '../utils/logger.js'

export interface OAuthProvider {
  validateToken(token: string): Promise<TokenValidationResult>
  refreshToken(refreshToken: string): Promise<OAuthToken>
  getUserInfo(token: string): Promise<UserInfo>
}

export class OAuthError extends Error {
  constructor(message: string, public override cause?: unknown) {
    super(message)
    this.name = 'OAuthError'
  }
}

async function postForm(url: string, body: Record<string, string>): Promise<any> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams(body).toString(),
  })
  const text = await res.text()
  if (!res.ok) {
    throw new OAuthError(`Token endpoint error ${res.status}: ${text}`)
  }
  try {
    return JSON.parse(text)
  } catch {
    // GitHub may return urlencoded; parse fallback
    return Object.fromEntries(new URLSearchParams(text))
  }
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

export class GitHubOAuthProvider implements OAuthProvider {
  constructor(private readonly config: ServerAuthConfig) {}

  async validateToken(token: string): Promise<TokenValidationResult> {
    try {
      const res = await fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      })
      if (!res.ok) {
        const text = await res.text()
        return { valid: false, error: `GitHub token invalid: ${res.status} ${text}` }
      }
      const scopesHeader = res.headers.get('x-oauth-scopes')
      const scopes = scopesHeader ? scopesHeader.split(',').map((s) => s.trim()).filter(Boolean) : undefined
      return { valid: true, scopes }
    } catch (err) {
      Logger.error('GitHub validateToken failed', err)
      return { valid: false, error: String(err) }
    }
  }

  async refreshToken(refreshToken: string): Promise<OAuthToken> {
    const json = await postForm(this.config.token_endpoint, {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: this.config.client_id,
      ...(this.config.client_secret ? { client_secret: String(this.config.client_secret) } : {}),
    })
    return toOAuthToken(json)
  }

  async getUserInfo(token: string): Promise<UserInfo> {
    const res = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })
    if (!res.ok) throw new OAuthError(`GitHub userinfo failed: ${res.status}`)
    const json = (await res.json()) as any
    return { id: String(json.id), name: json.name ?? undefined, email: json.email ?? undefined, avatarUrl: json.avatar_url ?? undefined }
  }
}

export class GoogleOAuthProvider implements OAuthProvider {
  private jwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'))

  constructor(private readonly config: ServerAuthConfig) {}

  async validateToken(token: string): Promise<TokenValidationResult> {
    // Try as JWT (id_token); fallback to userinfo call for access_token
    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        issuer: ['https://accounts.google.com', 'accounts.google.com'],
        audience: this.config.client_id ? String(this.config.client_id) : undefined,
      })
      const scopes = typeof payload.scope === 'string' ? payload.scope.split(' ') : undefined
      const exp = typeof payload.exp === 'number' ? payload.exp * 1000 : undefined
      return { valid: true, expiresAt: exp, scopes }
    } catch (_e) {
      // Not a valid id_token; try userinfo endpoint to validate access token
      try {
        const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) return { valid: false, error: `Google userinfo status ${res.status}` }
        return { valid: true }
      } catch (err) {
        return { valid: false, error: String(err) }
      }
    }
  }

  async refreshToken(refreshToken: string): Promise<OAuthToken> {
    const json = await postForm(this.config.token_endpoint, {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: this.config.client_id,
      ...(this.config.client_secret ? { client_secret: String(this.config.client_secret) } : {}),
    })
    return toOAuthToken(json)
  }

  async getUserInfo(token: string): Promise<UserInfo> {
    const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new OAuthError(`Google userinfo failed: ${res.status}`)
    const json = (await res.json()) as any
    return { id: String(json.sub), name: json.name, email: json.email, avatarUrl: json.picture }
  }
}

export class CustomOAuthProvider implements OAuthProvider {
  private jwks?: ReturnType<typeof createRemoteJWKSet>
  constructor(private readonly config: ServerAuthConfig & { jwks_uri?: string; issuer?: string; audience?: string }) {
    if (this.config['jwks_uri']) {
      this.jwks = createRemoteJWKSet(new URL(String(this.config['jwks_uri'])))
    }
  }

  async validateToken(token: string): Promise<TokenValidationResult> {
    // Prefer JWT validation if JWKS is provided, else try userinfo proxy via resource endpoint if configured
    if (this.jwks) {
      try {
        const { payload } = await jwtVerify(token, this.jwks, {
          issuer: this.config['issuer'] ? String(this.config['issuer']) : undefined,
          audience: this.config['audience'] ? String(this.config['audience']) : undefined,
        })
        const exp = typeof payload.exp === 'number' ? payload.exp * 1000 : undefined
        const scopes = typeof payload.scope === 'string' ? payload.scope.split(/[ ,]+/) : undefined
        return { valid: true, expiresAt: exp, scopes }
      } catch (err) {
        return { valid: false, error: String(err) }
      }
    }
    // As a generic fallback, we can't validate without provider-specific endpoint; treat as opaque Bearer
    try {
      decodeJwt(token) // will throw if not a JWT; but opaque tokens are allowed; just return valid unknown
      return { valid: true }
    } catch {
      return { valid: true } // opaque non-JWT tokens assumed valid at this layer
    }
  }

  async refreshToken(refreshToken: string): Promise<OAuthToken> {
    const json = await postForm(this.config.token_endpoint, {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: this.config.client_id,
      ...(this.config.client_secret ? { client_secret: String(this.config.client_secret) } : {}),
    })
    return toOAuthToken(json)
  }

  async getUserInfo(token: string): Promise<UserInfo> {
    // Generic OIDC userinfo often available at `${issuer}/userinfo`; but we only have authorization/token endpoints here.
    const issuer = (this.config as any).issuer as string | undefined
    if (!issuer) throw new OAuthError('userinfo endpoint unknown for custom provider (missing issuer)')
    const url = new URL('/userinfo', issuer).toString()
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) throw new OAuthError(`Custom OIDC userinfo failed: ${res.status}`)
    const json = (await res.json()) as any
    return { id: String(json.sub ?? json.id ?? 'unknown'), ...json }
  }
}

export function getOAuthProvider(config: ServerAuthConfig & { jwks_uri?: string; issuer?: string; audience?: string }): OAuthProvider {
  switch (config.provider) {
    case 'github':
      return new GitHubOAuthProvider(config)
    case 'google':
      return new GoogleOAuthProvider(config)
    default:
      return new CustomOAuthProvider(config)
  }
}
