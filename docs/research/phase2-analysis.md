# Master MCP Server — Phase 2 Analysis (Authentication System)

This document researches and specifies the technical approach for Phase 2 (Authentication System) of the Master MCP Server, aligned with `master-mcp-definition.md`. It focuses on portable, secure OAuth/OIDC, JWT validation, multi-strategy auth handling, and cross‑platform crypto/storage for Node.js and Cloudflare Workers.


## Phase 2 Scope Extract (from master-mcp-definition.md)

- Implement `MultiAuthManager` with JWT validation and strategy handling
- Implement OAuth providers (GitHub, Google, Custom OIDC)
- Implement `TokenManager` with encryption and storage
- Support all 4 strategies: `master_oauth`, `delegate_oauth`, `bypass_auth`, `proxy_oauth`
- Handle token validation, refresh, and user info retrieval

Implications: We must pick portable libraries, design secure token lifecycle, and define provider abstractions that run on Node (Docker/Koyeb) and Workers (no Node built‑ins, serverless storage).


## OAuth 2.0 / OIDC Best Practices

- Authorization Code + PKCE: Use the Authorization Code flow with PKCE for browser or agent-mediated flows. Always generate `code_verifier` and `code_challenge` (S256).
- State and Nonce: Generate a high-entropy `state` for CSRF protection and, for OIDC, a `nonce` to bind ID tokens to the login request. Validate both on callback. Expire after ~5 minutes.
- Redirect URI allowlist: Pre-register and strictly match redirect URIs per provider. Never reflect arbitrary redirect targets.
- Scope minimization: Request the smallest viable scopes. Maintain per-server required scopes in config.
- Token types: Distinguish `access_token` (API auth) vs `id_token` (identity). Do not send `id_token` to backends as bearer unless explicitly required.
- Audience/Issuer checks: Validate `iss`, `aud`, `exp`, `iat`, `nbf` with clock skew tolerance (e.g., ±60s). Prefer asymmetric signing (RS256/ES256/EdDSA). Avoid HS256 for third-party tokens.
- JWKS caching & rotation: Fetch JWKS via discovery and cache with TTL/ETag. Gracefully handle key rotation (kid mismatch → refresh JWKS and retry).
- Refresh hygiene: Use refresh tokens only on server side; store encrypted, rotate when server issues a new one, and scope usage to the provider that minted it.
- Userinfo vs ID token: Prefer `userinfo` endpoint for current profile when available (avoids stale claims); accept `id_token` for identity claims at login time.
- Error handling and retries: Back off on provider rate limits; treat invalid_grant as terminal (require re-auth). Log minimal, never tokens.
- PKCE/code replay: Single-use authorization codes and state. Reject reused or late callbacks.


## JWT Validation and Refresh Strategies

- Verification with `jose`:
  - Use `createRemoteJWKSet(new URL(issuer + '/.well-known/jwks.json'))`.
  - Verify with `jwtVerify(token, jwks, { issuer, audience, algorithms: ['RS256','ES256','EdDSA'] })`.
  - Apply a small `clockTolerance` (e.g., 60 seconds).
- Opaque tokens: If `access_token` is opaque (e.g., GitHub OAuth App), “validate” by calling a lightweight endpoint (`/user` or introspection when offered). Cache the positive result short-term.
- Refresh orchestration:
  - Store `expires_at` and proactively refresh if `now + skew >= expires_at`.
  - Deduplicate concurrent refreshes per (client, server) using a mutex/singleflight keyed in memory (Node) or Durable Object (Workers).
  - Respect provider rotation semantics (some rotate refresh tokens; persist latest atomically).
- Audience mapping:
  - For `master_oauth`, ensure backend trusts the master’s issuer/audience, or perform RFC 8693 Token Exchange if backend requires its own audience.
  - For `proxy_oauth`, master uses a confidential client to exchange client’s token/identity for a backend-scoped token.
- Claim hardening:
  - Enforce `azp` (authorized party) when present, tenant constraints, and any custom `hd`/org domain checks for Google OIDC if configured.

Example (verification with jose):

```ts
import { createRemoteJWKSet, jwtVerify } from 'jose';

const jwks = createRemoteJWKSet(new URL('https://issuer.example/.well-known/jwks.json'));
const { payload, protectedHeader } = await jwtVerify(accessToken, jwks, {
  issuer: 'https://issuer.example/',
  audience: 'master-mcp',
  algorithms: ['RS256','ES256','EdDSA'],
  clockTolerance: 60,
});
```


## Cross-Platform Crypto (Node vs Workers)

- WebCrypto baseline:
  - Workers: `crypto.subtle` and `crypto.getRandomValues` are native.
  - Node 18+: use `globalThis.crypto = require('node:crypto').webcrypto` or `import { webcrypto as crypto } from 'node:crypto'`.
- Symmetric encryption: Use AES-GCM with 96-bit IV for token-at-rest encryption. Keys derived from an env secret via HKDF-SHA256 with per-purpose salt.
- Encoding: Use base64url for storage; include `{ v:1, alg:'A256GCM', iv, ct, tag }` structure to enable future rotation.
- Key rotation: Support key versioning `KID` in env (e.g., `TOKEN_ENC_KEY_v2`) and re-encrypt on read if older.

Example (portable AES-GCM with WebCrypto):

```ts
// Derive AES-GCM key from an ENV secret using HKDF
async function deriveKey(secretB64: string, salt: Uint8Array) {
  const raw = Uint8Array.from(atob(secretB64), c => c.charCodeAt(0));
  const ikm = await crypto.subtle.importKey('raw', raw, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: new Uint8Array([]) },
    ikm,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptJson(obj: unknown, key: CryptoKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const pt = new TextEncoder().encode(JSON.stringify(obj));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, pt));
  return { v: 1, alg: 'A256GCM', iv: btoa(String.fromCharCode(...iv)), ct: btoa(String.fromCharCode(...ct)) };
}

export async function decryptJson(p: { iv: string; ct: string }, key: CryptoKey) {
  const iv = Uint8Array.from(atob(p.iv), c => c.charCodeAt(0));
  const ct = Uint8Array.from(atob(p.ct), c => c.charCodeAt(0));
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return JSON.parse(new TextDecoder().decode(new Uint8Array(pt)));
}
```


## Token Storage Patterns

- In-memory (Map)
  - Pros: Simple, fast, zero-dependency; good for dev and single-instance Node.
  - Cons: Not shared across instances; lost on restart; unsuitable for Workers scale-out.
- Redis/Upstash (Node or Workers via HTTP API)
  - Pros: Strong consistency, TTL, eviction, pub/sub for revocation; battle-tested.
  - Cons: External dependency; latency in Workers if regionally distant.
- Cloudflare KV
  - Pros: Durable, cheap, TTL support, easy binding.
  - Cons: Eventual consistency; not ideal for immediate session data. Use for refresh tokens and non-critical caches.
- Durable Objects (Workers)
  - Pros: Strongly consistent, per-key single-threaded coordination; ideal for singleflight refresh and per-client maps.
  - Cons: Higher cost per instance; requires routing logic.
- D1/SQLite or Postgres
  - Pros: Queryable, transactional; good for audit trails and multi-tenant metadata.
  - Cons: Operational overhead.

Data model (recommendation):
- Keys: `auth:<tenant>:client:<hash(clientToken)>:server:<serverId>` → encrypted `{ access_token, refresh_token?, expires_at, scope, provider, user_info? }`.
- Hashing: Use salted SHA-256 of client token for keys (no raw tokens in keys). Store encrypted values only.
- TTL: Set to `expires_at + grace`; background cleanup scans (Node) or rely on KV/Redis TTL.
- Concurrency: Use Durable Object/Redis lock for refresh singleflight.


## OAuth Provider Integration Patterns

Define a common interface and implement providers with `oauth4webapi` for standard flows. For non-OIDC (GitHub OAuth App), implement token exchange and validation via API calls.

```ts
export interface OAuthProvider {
  validateToken(token: string): Promise<{ active: boolean; exp?: number; sub?: string }>;
  refreshToken(refreshToken: string): Promise<OAuthToken>;
  getUserInfo(token: string): Promise<{ sub: string; email?: string; name?: string }>;
}
```

- GitHub (OAuth App; non-OIDC by default)
  - Discovery: Manual endpoints. Auth: `https://github.com/login/oauth/authorize`; Token: `https://github.com/login/oauth/access_token`.
  - Validation: Call `GET https://api.github.com/user` with bearer; treat 200 as active; cache short-term.
  - Refresh: Classic OAuth App tokens are often non-expiring; fine-grained and GH App flows can expire and support refresh. Implement refresh when `refresh_token` is issued; otherwise re-auth.
  - User info: `/user` + `/user/emails` if needed for verified email.

- Google (OIDC)
  - Discovery: `https://accounts.google.com/.well-known/openid-configuration`.
  - Validation: Verify JWT `id_token` via jose; use `userinfo` for fresh claims.
  - Refresh: Standard OAuth 2.0 refresh via token endpoint.

- Custom OIDC
  - Discovery: `/.well-known/openid-configuration` from configured issuer.
  - Validation: jose JWKS verification; audience/issuer from config.
  - Refresh: Standard refresh.

Example (oauth4webapi code grant + PKCE):

```ts
import * as oauth from 'oauth4webapi';

// During login (build URL)
const as = await oauth.discoveryRequest(new URL(issuer), { algorithm: 'oidc' })
  .then(res => oauth.processDiscoveryResponse(new URL(issuer), res));
const pkce = await oauth.generatePKCECodePair();
const authUrl = new URL(as.authorization_endpoint!);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('client_id', clientId);
authUrl.searchParams.set('redirect_uri', redirectUri);
authUrl.searchParams.set('scope', scopes.join(' '));
authUrl.searchParams.set('code_challenge', pkce.code_challenge);
authUrl.searchParams.set('code_challenge_method', 'S256');
authUrl.searchParams.set('state', state);

// On callback (exchange)
const tokenRes = await oauth.authorizationCodeGrantRequest(as, client, code, redirectUri, pkce.code_verifier);
const tokens = await oauth.processAuthorizationCodeOpenIDResponse(as, client, tokenRes);
// tokens contains access_token, id_token, refresh_token, etc.
```


## Multi-Auth Strategy Implementation

Implement `MultiAuthManager.prepareAuthForBackend(serverId, clientToken)` to branch by strategy and return either headers (`AuthHeaders`) or a delegation object (`OAuthDelegation`).

- master_oauth
  - Flow: Verify client’s master JWT → attach as `Authorization: Bearer <token>` to backend if backend trusts master issuer/audience.
  - Variations: If backend requires its own audience, perform Token Exchange (RFC 8693) if supported, else fall back to `proxy_oauth` configuration for that server.

- delegate_oauth
  - Flow: Return an `OAuthDelegation` with provider endpoints and required scopes. Client performs OAuth with backend’s provider; callback stores resulting server token mapped to (client, server).
  - Storage: Persist `{ access_token, refresh_token?, expires_at, scope }` via `TokenManager.storeToken` keyed by `(clientTokenHash, serverId)`.

- proxy_oauth
  - Flow: Master acts as a confidential client to backend provider, exchanging either a client assertion (JWT bearer) or the master token for a backend-scoped token. On success, attach backend token in headers.
  - Notes: Prefer standards (JWT bearer grant, RFC 7523 or Token Exchange RFC 8693). If unsupported, negotiate provider-specific proxy flow.

- bypass_auth
  - Flow: No headers added. Route request as-is.

Suggested `prepareAuthForBackend` outline:

```ts
async prepareAuthForBackend(serverId: string, clientToken: string) {
  const cfg = this.serverAuthConfigs.get(serverId)!;
  if (!(await this.validateClientToken(clientToken))) throw new Error('Invalid client token');
  switch (cfg.strategy) {
    case 'master_oauth':
      return this.handleMasterOAuth(serverId, clientToken);
    case 'delegate_oauth':
      return this.handleDelegatedOAuth(serverId, clientToken, cfg);
    case 'proxy_oauth':
      return this.handleProxyOAuth(serverId, clientToken, cfg);
    case 'bypass_auth':
      return {};
    default:
      throw new Error('Unknown strategy');
  }
}
```


## State/Nonce Management for OAuth Flows

- State structure: Base64url-encoded JSON `{ sid: serverId, iat, cth: hash(clientToken), nonce }`.
- Authenticity: Sign state with HMAC-SHA256 using an env secret. On callback, verify signature and freshness without needing server-side storage.
- Single-use: Optionally store a one-time token in KV/DO keyed by `state` to prevent replay across time windows.
- Nonce: For OIDC, persist nonce (in DO or within state) and verify `id_token.nonce`.

Example (stateless signed state):

```ts
import { createHmac } from 'node:crypto'; // or subtle HMAC in Workers

function signState(payload: string, secret: string) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function buildState(data: any, secret: string) {
  const payload = Buffer.from(JSON.stringify(data)).toString('base64url');
  const sig = signState(payload, secret);
  return `${payload}.${sig}`;
}

function verifyState(state: string, secret: string) {
  const [payload, sig] = state.split('.');
  const expected = signState(payload, secret);
  if (sig !== expected) throw new Error('bad state');
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
}
```


## jose vs jsonwebtoken (and OIDC libraries)

- jose
  - Pros: Standards-first, ESM, WebCrypto-based; runs in Workers and Node; robust JWK/JWKS support; supports EdDSA/ES algorithms; active maintenance.
  - Cons: Slightly lower-level than some Node-specific libs; requires understanding of WebCrypto constraints.
- jsonwebtoken
  - Pros: Popular in Node; simple API.
  - Cons: Node-only crypto; CJS focus; not compatible with Workers without shims; limited modern alg coverage; encourages HS256 defaults which are risky for third-party tokens.
- Recommendation: Use `jose` for JWTs and signing needs. For OIDC/OAuth client flows, use `oauth4webapi` (spec-aligned, portable). Avoid `openid-client` in Workers (Node-centric) and avoid `jsonwebtoken`.
- Action for this repo: Align dependencies to `jose` + `oauth4webapi`; remove/prevent `jsonwebtoken`. Ensure code examples and Token/JWK handling use `jose`.


## TokenManager Design

Responsibilities:
- Encrypt/decrypt tokens (AES-GCM via WebCrypto)
- Store/retrieve by `(clientTokenHash, serverId)` across backends
- Cleanup expired tokens and rotate refresh tokens
- Generate/validate state strings for OAuth delegation

Interface considerations:
- Pluggable storage backends: in-memory (dev), Redis, KV, Durable Objects
- Transparent encryption at rest; keys sourced from `ENV.TOKEN_ENC_KEY_*`
- Small API: `storeToken`, `getToken`, `cleanupExpiredTokens`, `generateState`, `validateState`

Sample `generateState` and `validateState` (HMAC-based, portable):

```ts
async function hmacSign(input: Uint8Array, secretKey: CryptoKey) {
  const sig = await crypto.subtle.sign('HMAC', secretKey, input);
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

export async function generateState(data: any, secretKey: CryptoKey) {
  const payload = new TextEncoder().encode(JSON.stringify({ ...data, iat: Date.now() }));
  const sig = await hmacSign(payload, secretKey);
  return `${btoa(String.fromCharCode(...payload))}.${sig}`;
}

export async function validateState(state: string, secretKey: CryptoKey) {
  const [p64, sig] = state.split('.');
  const payload = Uint8Array.from(atob(p64), c => c.charCodeAt(0));
  const expected = await hmacSign(payload, secretKey);
  if (sig !== expected) return null;
  return JSON.parse(new TextDecoder().decode(payload));
}
```


## OAuth Delegation and Proxy Flows

- Delegation (`delegate_oauth`)
  - Purpose: When a backend owns its OAuth and the master should not impersonate users.
  - Approach: `prepareAuthForBackend` returns an `OAuthDelegation` object with endpoints/scopes and a time-limited `state`. The client completes OAuth; callback stores the backend token.
  - UX: Provide a short redirect/success page (Phase 7) and return instructions/URL to the client.

- Proxy (`proxy_oauth`)
  - Purpose: Master obtains tokens for backend using its own client credentials and optionally a user assertion.
  - Approach: Prefer JWT Bearer or Token Exchange grants. Maintain backend tokens per user and refresh as needed. Ensure auditing and clear separation from `master_oauth`.


## Security Considerations

- Secrets: Keep encryption keys and OAuth client secrets in env variables (Workers `vars`, Docker secrets). Rotate regularly; support multi-key decryption with `kid`.
- Logging: Never log raw tokens; log at most first 6 chars and hash. Scrub errors from providers.
- Rate limiting: Per-IP and per-client on auth endpoints; protect refresh/token exchange.
- CSRF: State validation; if using cookies, set `SameSite=Lax`, `Secure`, `HttpOnly`.
- CORS: Lock down origins for HTTP endpoints that expose OAuth flows in Node/Koyeb deployments.
- Transport security: HTTPS only; set HSTS in Node deployments.
- Replay/resynchronization: Enforce single-use codes and states; add small clock tolerance for JWT.
- Multi-tenant isolation: Namespaces per tenant in storage keys and separate encryption keys when feasible.


## Implementation Notes Tied to Phase 2 Files

- `src/auth/multi-auth-manager.ts`
  - Use `jose` for `validateClientToken` with a cached JWKS per issuer.
  - Implement `storeDelegatedToken`/`getStoredServerToken` via `TokenManager`; avoid storing plaintext.
  - Apply singleflight on refresh and JWKS fetch.

- `src/auth/oauth-providers.ts`
  - Implement `GitHubOAuthProvider` using GitHub token API + `/user` validation.
  - Implement `GoogleOAuthProvider` using discovery + jose for id_token verification.
  - Implement `CustomOAuthProvider` using configured issuer and oauth4webapi discovery.

- `src/auth/token-manager.ts`
  - Provide a storage abstraction; default in-memory dev store; additional backends wired in deployments (KV/Redis/DO).
  - AES-GCM encryption helpers in `src/utils/crypto.ts`.


## Minimal Code Snippets (Drop-in)

JWT verify with JWKS (master_oauth):

```ts
import { createRemoteJWKSet, jwtVerify } from 'jose';

export async function verifyMasterJwt(token: string, issuer: string, audience: string) {
  const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
  return jwtVerify(token, jwks, { issuer, audience, clockTolerance: 60 });
}
```

Provider-agnostic refresh (oauth4webapi):

```ts
import * as oauth from 'oauth4webapi';

export async function refresh(as: oauth.AuthorizationServer, client: oauth.Client, refreshToken: string) {
  const res = await oauth.refreshTokenGrantRequest(as, client, refreshToken);
  const result = await oauth.processRefreshTokenResponse(as, client, res);
  if (oauth.isOAuth2Error(result)) throw new Error(result.error_description || result.error);
  return result; // { access_token, refresh_token?, expires_in, scope }
}
```

Node/Workers-safe token encryption (AES-GCM):

```ts
export async function encryptTokenForStore(token: OAuthToken, key: CryptoKey) {
  return encryptJson(token, key); // from Cross-Platform Crypto section
}
```


## Summary of Recommendations

- Use `jose` for JWT/JWK handling; avoid `jsonwebtoken`.
- Use `oauth4webapi` for OAuth/OIDC flows across Node and Workers.
- Implement AES-GCM encryption with WebCrypto for tokens at rest; support key rotation.
- Choose storage per platform: in-memory (dev), Redis (Node), KV + Durable Objects (Workers), always encrypt.
- Implement all four auth strategies with clear boundaries: pass-through (master), user-driven delegation, proxy/exchange, or bypass.
- Enforce state/nonce, PKCE, issuer/audience checks, and short-lived tokens with proactive refresh.

These patterns meet Phase 2 requirements with a secure, portable baseline for future phases (routing, endpoints, deployments).

