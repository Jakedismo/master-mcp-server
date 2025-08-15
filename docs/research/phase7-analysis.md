# Phase 7: OAuth Flow Handling — Research & Design Analysis

This document analyzes Phase 7 for the Master MCP Server, focusing on secure, user‑friendly OAuth 2.0/OIDC flows with PKCE, robust state/nonce validation, consistent callback processing, provider quirks, and a minimal web UI that works across desktop and mobile. The goal is to integrate tightly with the existing MultiAuthManager and configuration system while remaining cross‑runtime (Node and Workers).

Contents
- Overview and Goals
- Authorization Code Flow + PKCE
- Endpoint Design (Task 7.1)
- State, PKCE, and Nonce Management
- Callback Processing and Token Exchange
- Errors and Edge Cases
- Web Interface (Task 7.2)
- Mobile and Deep Linking
- Provider Integrations and Quirks
- Security Considerations and Mitigations
- Libraries and Implementation Approaches
- Cross‑Platform Considerations (Node & Workers)
- Proposed Implementation Outline (for this repo)
- Examples (TS skeletons + HTML)
- Testing Strategy
- Phase 7 Checklist
- Notes Tied to This Repo

---

## Overview and Goals

Goals for Phase 7:
- Implement end‑to‑end OAuth authorization flows with Authorization Code + PKCE by default.
- Provide HTTP endpoints to initiate authorization, handle callbacks, validate state/nonce, and exchange tokens.
- Offer small, accessible HTML pages for consent redirection, success, and error.
- Handle provider differences (OIDC discovery vs. static endpoints, extra params, response modes).
- Maintain high security: CSRF protection, PKCE S256, strict redirect/return validation, replay/mix‑up mitigations.
- Integrate with existing `MultiAuthManager`, `TokenManager`, and configuration.
- Work across Node and Workers with minimal branching.

Non‑Goals in Phase 7:
- Full admin UI; only OAuth consent/callback web pages.
- Complex session management beyond what is needed for OAuth state.

---

## Authorization Code Flow + PKCE

Recommended baseline: Authorization Code Flow with PKCE (S256). Reasons:
- PKCE prevents code interception and mitigates authorization code leakage.
- Works for public clients and is recommended even for confidential clients.
- OIDC ID Token can be optionally requested and validated to assert user identity.

Key parameters:
- response_type=code
- code_challenge, code_challenge_method=S256 (derived from a random code_verifier)
- state=random high‑entropy value (bound to server‑side flow state)
- scope includes openid (when OIDC) plus provider‑specific scopes
- nonce=random value for OIDC ID Token replay protection
- response_mode=form_post for providers that support it (prevents query leakage); otherwise default query

---

## Endpoint Design (Task 7.1)

Provide clear, REST‑like endpoints. Suggested routes (Node Express, or analogous Worker handlers):
- GET `/oauth/:provider/start` — Initiate auth with provider or server‑specific provider; issues redirect.
- GET or POST `/oauth/:provider/callback` — Handle callback, validate state/nonce, exchange code for tokens.
- GET `/oauth/status/:flowId` — Optional polling endpoint for delegated flows (headless/CLI/mobile coordination).

Query/body parameters for `/oauth/:provider/start`:
- `provider`: one of configured providers or an alias resolving to a `ServerAuthConfig`.
- `serverId` (optional): bind the flow to a specific server for delegated OAuth.
- `scopes` (optional): comma/space‑delimited extra scopes to merge with defaults.
- `return_to` (optional): post‑flow redirect target; must pass allow‑list and/or be path‑only.
- `ui` (optional): `popup|redirect` hint for UI page behavior.
- Provider‑specific optional flags: e.g., `prompt`, `access_type=offline` (Google), `tenant` (Microsoft), `response_mode`.

Callback `/oauth/:provider/callback` handles:
- `code`, `state`, optional OIDC `iss`, and errors (`error`, `error_description`).
- POST form bodies for `response_mode=form_post`.

---

## State, PKCE, and Nonce Management

State (CSRF):
- Generate a high‑entropy state value per flow and bind it to server‑side flow metadata (provider, serverId, return_to, timestamps, code_verifier hash, nonce).
- Double‑submit cookie: set a cookie mirroring the state (or HMAC of state). On callback, require state param AND matching cookie value. Use `HttpOnly; Secure; SameSite=Lax` for query callback, `SameSite=None` only if using `form_post`.
- TTL: 5–10 minutes; one‑time consumption. Delete after successful or failed processing.

PKCE:
- Generate a URL‑safe `code_verifier` (43–128 chars). Derive `code_challenge = base64url(sha256(code_verifier))`. Always use `S256`; never `plain`.
- Store `code_verifier` in the flow state (server‑side) and never expose it to the client.

Nonce (OIDC):
- When requesting an ID Token, generate a random nonce and store it in the flow state. After token exchange, verify the nonce in the ID Token.

State storage patterns:
- Stateless signed state (what the repo already supports via `TokenManager.generateState`) is acceptable for small metadata, but PKCE verifier must be server‑side only. Use a short‑lived server store keyed by `state` for PKCE/nonce.
- Implementation options: in‑memory map with TTL (Node), Durable Object/KV (Workers), or a signed state that contains a “flow key” pointing to server storage.

---

## Callback Processing and Token Exchange

On callback:
1. Parse parameters; if `error` present, short‑circuit to error handling.
2. Validate `state` against server store and double‑submit cookie, ensure TTL not exceeded, and ensure one‑time use.
3. Look up the stored PKCE `code_verifier` and (optional) `nonce`.
4. Exchange the authorization code at the provider’s token endpoint using `application/x-www-form-urlencoded` with fields:
   - `grant_type=authorization_code`
   - `code`, `redirect_uri`, `client_id`, optional `client_secret` (confidential) or client assertion
   - `code_verifier`
5. Normalize token response: `access_token`, `refresh_token?`, `expires_in`, `scope`, `id_token?`.
6. If `id_token` present: validate JWT signature and claims (issuer, audience, nonce, exp, iat). Use JOSE/JWKS.
7. Persist token via `TokenManager` according to the selected strategy:
   - Delegated OAuth for backends: bind to `(serverId, client binding)` and store in `TokenManager` for proxying.
   - Master logon: bind to the current principal/session as per Phase 2.
8. Redirect to success page (or `return_to`) with no sensitive query parameters. Consider a one‑time `flowId` or short success token if the client needs to poll.
9. Cleanup: delete state entry and clear the `oauth_state` cookie.

---

## Errors and Edge Cases

Handle and render clear messages for:
- `error=access_denied`, `interaction_required`, `login_required`, `consent_required`.
- Missing/invalid `state`, expired state, mismatched cookie state.
- Token endpoint errors: network timeouts, `invalid_grant`, `invalid_client`, `invalid_scope`, provider 400/401.
- Replayed callbacks or duplicated `code` usage (one‑time enforcement).
- Mismatched provider mix‑up: ensure the callback provider matches the start’s provider (store provider in state; prefer per‑provider redirect paths).

Operational considerations:
- Idempotent error pages; safe to refresh.
- Rate‑limit start and callback endpoints to resist abuse.
- Log with correlation IDs, but never log raw tokens or codes.

---

## Web Interface (Task 7.2)

Pages:
- Consent redirect page (optional): a minimal intermediate page that prepares UI context (e.g., popup) then performs a 302 to the provider.
- Success page: friendly confirmation, includes `window.opener?.postMessage(...)` and `window.close()` for popup flows, with a fallback “Continue” link for full‑page flows.
- Error page: clear error name/description, retry guidance, and link back to start.

Design principles:
- Accessible HTML (semantic headings, ARIA for status), minimal CSS, responsive layout that works on mobile.
- Robust CSP and security headers: `Content-Security-Policy`, `X-Frame-Options: DENY` (or `frame-ancestors 'none'`), `Referrer-Policy: no-referrer` on the callback exchange response.
- Avoid leaking sensitive values to the page or URL. Do not render tokens client‑side.

Redirect handling:
- Use a whitelist for `return_to`/`continue` URLs. Prefer relative path redirects. For absolute URLs, maintain an allow‑list of trusted origins.
- Support deep linking by mapping a path token to an app route rather than passing arbitrary URLs.

---

## Mobile and Deep Linking

Goals:
- Smooth UX on small screens and native apps.
- Safe handoff back to a native/desktop client.

Patterns:
- Custom scheme deep link (e.g., `myapp://oauth-complete?flowId=...`) initiated by the success page with a time‑delayed fallback to an HTTPS route if native app is not installed.
- Universal/App Links (iOS/Android): use verified HTTPS links that the app claims; success page redirects to the universal link which the OS routes into the app.
- Device Authorization Grant (RFC 8628) for CLI/headless: Provide an alternative flow where a user enters a code at the provider; status polled at `/oauth/status/:flowId`.

Responsive UI:
- Ensure buttons and links are large enough for touch.
- Avoid fine‑grained input; OAuth pages shouldn’t require typing.

---

## Provider Integrations and Quirks

Google:
- Use `access_type=offline` and sometimes `prompt=consent` to obtain `refresh_token`.
- OIDC `.well-known/openid-configuration` available; strong JWKS support; ID Token includes `hd`, `email_verified`.
- `response_mode=form_post` available; prefer to avoid query leakage.

GitHub:
- Historically non‑OIDC; now supports OIDC for Actions/GitHub Apps; OAuth Apps token endpoint may return urlencoded bodies.
- Scopes comma or space separated; expiring user tokens with refresh tokens are available if enabled in settings.

Microsoft Entra ID (Azure AD):
- v2.0 endpoints use `scope` (not `resource`); include `offline_access` for refresh.
- Tenants: `common`, `organizations`, or specific tenant IDs; B2C needs policy (`p=`) parameters.
- Strongly recommend `response_mode=form_post`.

Auth0 / Okta / Generic OIDC:
- Support discovery and JWKS; PKCE required for public clients.
- May require organization/connection hints; support `prompt` and `screen_hint`.

Apple Sign In:
- Client secret is a JWT signed by your key; short‑lived. Requires team ID, key ID.
- Always use `response_mode=form_post`. Nonce strongly recommended.

Salesforce:
- Instance and domain specifics; may return additional fields in token response. Scope names differ.

General:
- Always prefer provider discovery for OIDC; for pure OAuth providers, keep endpoints configurable in `ServerAuthConfig`.
- Keep a provider adapter layer (already present in `oauth-providers.ts`) to normalize validation/userinfo.

---

## Security Considerations and Mitigations

Threats and mitigations:
- CSRF on callback: use `state` + double‑submit cookie, SameSite=Lax where possible; form_post implies SameSite=None; Secure.
- Authorization code interception: always use PKCE S256; one‑time state; HTTPS only.
- Mix‑up attacks: bind state to provider and enforce per‑provider callback paths; verify issuer for OIDC.
- Open redirects: strictly validate `return_to` against allow‑lists or require relative paths.
- Token/code leakage via URL/referrer/logs: prefer `response_mode=form_post`; set `Referrer-Policy: no-referrer`; never log full URLs with code; scrub analytics.
- Replay: one‑time state consumption and code usage; delete flow state after callback.
- Scope escalation: request minimal scopes; validate configured scopes against allow‑list per provider.
- Clickjacking: set `frame-ancestors 'none'` and `X-Frame-Options: DENY` on OAuth pages.
- Cookie theft: `Secure; HttpOnly; SameSite` on OAuth cookies; short TTL.
- Secret management: keep client secrets out of repo; load via env/secret manager (Phase 6 guidance).
- JWT validation: verify signature, `iss`, `aud`, `exp`, `iat`, `nonce` when ID Token is used.
- Rate limiting: throttle `/start` and `/callback` endpoints.
- Audit: log correlation IDs, decision points (state validated, token exchanged) without sensitive values.

---

## Libraries and Implementation Approaches

Modern, standards‑compliant options:
- `oauth4webapi` (isomorphic, spec‑centric): great for Authorization Code + PKCE, discovery, DPoP support; works in Node and Workers with Web Crypto.
- `openid-client` (Node‑only): mature OIDC/OAuth client supporting discovery, RP features, PKCE.
- `jose` (already used): for JWT validation and JWKS; pair with manual token exchange logic.

Recommended for this repo:
- Use existing `node-fetch` and `jose` for low‑level HTTP/JWT where already present.
- Consider adding `oauth4webapi` to reduce custom code for discovery, token exchange, and spec compliance, especially for Workers compatibility.

Key utilities to implement or reuse:
- PKCE helpers (code_verifier generator, S256 challenge function).
- State store with TTL and one‑time consumption (in‑memory/KV/DO). Keep interface abstract.
- HTML page renderer (minimal server‑side templates or static assets + small script for popup postMessage and deep link).

---

## Cross‑Platform Considerations (Node & Workers)

Node:
- Use Express‑style handlers; `crypto` for randomness/sha256 (or Web Crypto via `crypto.webcrypto.subtle` in Node 18+).
- In‑memory state store is fine for single‑instance dev; use Redis or similar for multi‑instance deployments.

Workers:
- Use `fetch` event router and `Response.redirect` for `/start`.
- Use `crypto.subtle` for PKCE S256.
- Store flow state in Durable Objects or KV with TTL; avoid per‑instance memory.

Isomorphic patterns:
- Implement `OAuthStateStore` interface and provide Node/Worker implementations.
- Feature‑test for `crypto.subtle` to pick hashing primitive.
- Avoid Node‑only modules in shared code; keep adapters thin.

---

## Proposed Implementation Outline (for this repo)

New/updated modules:
- `src/auth/pkce.ts`: generate code_verifier/challenge (S256) with Web Crypto or Node crypto fallback.
- `src/auth/oauth-state-store.ts`: define `OAuthStateStore` with methods `create(stateOrNull, data, ttlMs)`, `consume(state)`, backed by in‑memory Map (Node) and KV/DO (Workers).
- `src/server/oauth-routes.ts`: Express router for `/oauth/:provider/start` and `/oauth/:provider/callback` including cookie handling and redirects.
- `src/server/pages/oauth-pages.ts` or static `public/oauth/*.html`: success and error pages.
- `src/server/master-server.ts` integration: mount new OAuth routes; add security headers for OAuth pages.

Data model for flow state (example):
```ts
type OAuthFlowData = {
  providerId: string
  serverId?: string
  returnTo?: string
  codeVerifier: string
  nonce?: string
  createdAt: number
  clientBinding?: string // to link delegated tokens to a client context
}
```

Cookies:
- `mcp_oauth_state`: value = state (or HMAC(state)); `HttpOnly; Secure; SameSite=Lax; Path=/oauth/`.
- Optionally `mcp_oauth_flow`: opaque flow ID for success page or polling.

Config wiring:
- Use `ConfigManager.getConfig()` to resolve provider endpoints by `provider` param or `serverId` → `auth_config`.
- For OIDC providers with `issuer`, perform discovery on bootstrap and cache metadata (optional in Phase 7; manual endpoints already in types).

Token storage:
- For delegated OAuth (`AuthStrategy.DELEGATE_OAUTH`), after token exchange call `MultiAuthManager.storeDelegatedToken(clientBinding, serverId, token)`.
- For proxy OAuth (`AuthStrategy.PROXY_OAUTH`), same storage path enables automatic header injection.
- Use `TokenManager` for encryption at rest; respect `TOKEN_ENC_KEY` prod requirement.

---

## Examples (TS skeletons + HTML)

PKCE helpers (Node/Workers compatible):
```ts
// src/auth/pkce.ts
export function randomUrlSafeBytes(len = 32): string {
  const buf = new Uint8Array(len)
  ;(globalThis.crypto || (require('node:crypto') as any).webcrypto).getRandomValues(buf)
  return base64url(buf)
}

export function base64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export async function sha256(input: string): Promise<Uint8Array> {
  const enc = new TextEncoder().encode(input)
  const subtle = (globalThis.crypto || (require('node:crypto') as any).webcrypto).subtle
  const digest = await subtle.digest('SHA-256', enc)
  return new Uint8Array(digest)
}

export async function createPkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = randomUrlSafeBytes(48)
  const challenge = base64url(await sha256(verifier))
  return { verifier, challenge }
}
```

Start endpoint sketch:
```ts
// src/server/oauth-routes.ts (excerpt)
app.get('/oauth/:provider/start', async (req, res) => {
  const { provider } = req.params
  const { serverId, return_to, scopes } = req.query as Record<string, string>

  const cfg = resolveProviderConfig(provider, serverId) // from ConfigManager
  const { verifier, challenge } = await createPkce()
  const state = await stateStore.create(/* random id */, { providerId: provider, serverId, returnTo: sanitizeReturnTo(return_to), codeVerifier: verifier, createdAt: Date.now() }, 10 * 60_000)
  res.cookie('mcp_oauth_state', state, { httpOnly: true, sameSite: 'lax', secure: true, path: '/oauth' })

  const authorizeUrl = new URL(cfg.authorization_endpoint)
  authorizeUrl.searchParams.set('response_type', 'code')
  authorizeUrl.searchParams.set('client_id', String(cfg.client_id))
  authorizeUrl.searchParams.set('redirect_uri', String(cfg.redirect_uri))
  authorizeUrl.searchParams.set('scope', (cfg.scopes ?? []).concat(parseScopes(scopes)).join(' '))
  authorizeUrl.searchParams.set('state', state)
  authorizeUrl.searchParams.set('code_challenge', challenge)
  authorizeUrl.searchParams.set('code_challenge_method', 'S256')
  // Optionally set nonce for OIDC

  return res.redirect(authorizeUrl.toString())
})
```

Callback endpoint sketch:
```ts
app.all('/oauth/:provider/callback', async (req, res) => {
  const provider = req.params.provider
  const params = req.method === 'POST' ? req.body : req.query
  const { code, state, error, error_description } = params as any
  if (error) return renderOAuthError(res, error, error_description)

  const cookieState = req.cookies['mcp_oauth_state']
  if (!state || state !== cookieState) return renderOAuthError(res, 'invalid_state', 'State mismatch')

  const flow = await stateStore.consume(state)
  if (!flow) return renderOAuthError(res, 'expired_state', 'State expired or already used')

  const cfg = resolveProviderConfig(provider, flow.serverId)
  const tokenRes = await fetch(cfg.token_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: String(code),
      redirect_uri: String(cfg.redirect_uri),
      client_id: String(cfg.client_id),
      ...(cfg.client_secret ? { client_secret: String(cfg.client_secret) } : {}),
      code_verifier: flow.codeVerifier,
    }).toString(),
  })
  const json = await tokenRes.json()
  if (!tokenRes.ok) return renderOAuthError(res, 'token_error', JSON.stringify(json))

  // Optionally verify ID Token (jose)
  await persistDelegatedToken(flow, json)

  clearOAuthCookies(res)
  return redirectSuccess(res, flow.returnTo)
})
```

Success page (popup‑friendly):
```html
<!doctype html>
<html lang="en">
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Connected</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 2rem; }
  .card { max-width: 520px; margin: 0 auto; padding: 1.5rem; border: 1px solid #e5e7eb; border-radius: 12px; }
  h1 { font-size: 1.2rem; margin: 0 0 .5rem; }
  p { color: #4b5563; }
  a.button { display: inline-block; margin-top: 1rem; padding: .6rem 1rem; background: #111827; color: #fff; border-radius: 8px; text-decoration: none; }
  @media (max-width: 480px) { body { margin: 1rem; } }
</style>
<body>
  <div class="card">
    <h1>Connected</h1>
    <p>You can close this window.</p>
    <a class="button" id="continue" href="/">Continue</a>
  </div>
  <script>
    try {
      window.opener && window.opener.postMessage({ type: 'oauth-success' }, '*');
      window.close();
    } catch (e) { /* ignored */ }
  </script>
</body>
</html>
```

---

## Testing Strategy

Test levels:
- Unit: PKCE generation correctness; state store TTL and one‑time consumption; cookie handling helpers; URL construction.
- Integration: mock provider (local HTTP server) for auth and token endpoints; end‑to‑end through `/start` → `/callback` with various `response_mode`s; ID Token verification.
- Provider adapters: parse/normalize token responses for GitHub (urlencoded), Google (JSON), Azure (form_post), etc.
- Cross‑runtime: Node Express vs Worker handlers using the same core flow logic.

Techniques:
- Deterministic randomness for tests via seeded RNG injections.
- Simulate network errors/timeouts and verify retry/backoff only where appropriate (token exchange usually single attempt unless transient 5xx).
- Property tests for state tampering and cookie mismatch.

---

## Phase 7 Checklist

- OAuth start and callback endpoints with PKCE S256
- State + double‑submit cookie + TTL + one‑time consumption
- ID Token validation (if requested) with nonce checks
- Success and error HTML pages (responsive, secure headers)
- Provider‑specific parameters and response_mode handling
- Strict `return_to` validation and deep linking support
- Logging and metrics without leaking secrets
- Cross‑platform state store (Node memory vs Workers KV/DO)
- Documentation for configuration and flows

---

## Notes Tied to This Repo

- `src/auth/token-manager.ts` already offers encryption and a `generateState`/`validateState` mechanism, but PKCE code_verifier must remain server‑side. Introduce an `OAuthStateStore` for ephemeral flow data keyed by `state`.
- `src/auth/multi-auth-manager.ts` supports delegated and proxy OAuth. For delegated flows, persist exchanged tokens via `storeDelegatedToken` using a stable client binding (derive a binding key in the flow state to map the final token to `(serverId, client)` as done by `keyFor(clientToken, serverId)`).
- `src/auth/oauth-providers.ts` normalizes providers (GitHub/Google/custom). Reuse it for token refresh and userinfo retrieval after initial exchange.
- `src/server/master-server.ts` (and Express setup in `src/index.ts`) is the right place to mount `/oauth` routes. Add small utility to add security headers for OAuth pages.
- `src/types/config.ts` contains `MasterOAuthConfig` and `ServerAuthConfig`. Keep provider endpoints configurable. Optionally add fields for `response_mode` preference and additional provider hints.
- Consider `oauth4webapi` for isomorphic flows; otherwise, keep using `node-fetch` and `jose` consistently.

