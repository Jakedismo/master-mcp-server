import { createTestServer } from '../../_utils/test-server.js'

export interface MockOidcOptions {
  issuer?: string
  clientId?: string
  clientSecret?: string
  scopes?: string[]
}

export async function startMockOidcProvider(opts?: MockOidcOptions): Promise<{
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  jwks_uri: string
  stop: () => Promise<void>
}> {
  const srv = await createTestServer()
  const issuer = opts?.issuer ?? `${srv.url}`
  const clientId = opts?.clientId ?? 'test-client'
  const scopes = opts?.scopes ?? ['openid', 'profile']

  const codeStore = new Map<string, { scope: string[] }>()

  // OIDC Discovery
  srv.register('GET', '/.well-known/openid-configuration', () => ({
    body: {
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
      token_endpoint: `${issuer}/token`,
      jwks_uri: `${issuer}/jwks.json`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
    },
  }))

  // Simplified authorize: immediately redirects back with code + state
  srv.register('GET', '/authorize', (_req, _raw) => {
    const url = new URL(_req.url || '/', issuer)
    const redirectUri = url.searchParams.get('redirect_uri') || ''
    const state = url.searchParams.get('state') || ''
    const scopeStr = url.searchParams.get('scope') || scopes.join(' ')
    const code = `code_${Math.random().toString(36).slice(2)}`
    codeStore.set(code, { scope: scopeStr.split(/[ ,]+/).filter(Boolean) })
    return {
      status: 302,
      headers: { location: `${redirectUri}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}` },
    }
  })

  // Token endpoint
  srv.register('POST', '/token', (_req, raw) => {
    const params = new URLSearchParams(raw || '')
    const code = params.get('code') || ''
    const rec = codeStore.get(code)
    if (!rec) return { status: 400, body: { error: 'invalid_grant' } }
    // Minimal token response
    return {
      body: {
        access_token: `at_${code}`,
        token_type: 'bearer',
        scope: rec.scope.join(' '),
        expires_in: 3600,
      },
    }
  })

  // Static JWKS (not strictly needed for current code paths)
  srv.register('GET', '/jwks.json', () => ({ body: { keys: [] } }))

  return {
    issuer,
    authorization_endpoint: `${issuer}/authorize`,
    token_endpoint: `${issuer}/token`,
    jwks_uri: `${issuer}/jwks.json`,
    stop: srv.close,
  }
}

