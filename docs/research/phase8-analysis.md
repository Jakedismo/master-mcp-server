# Phase 8: Utilities and Helpers — Research & Design Analysis

This document analyzes Phase 8 for the Master MCP Server, focusing on a secure, performant, cross‑runtime utility foundation (Node.js and Cloudflare Workers) that supports logging/monitoring, cryptographic helpers, validation/sanitization, HTTP helpers, performance and profiling, caching, error handling, and development/debug tooling. The goal is to design small, composable utilities with clear interfaces and minimal runtime branching, reusing Web Platform primitives where possible.

Contents
- Overview and Goals
- Design Principles
- Structured Logging
- Cryptographic Utilities
- Validation and Sanitization
- HTTP Utilities
- Date/Time Utilities
- String and Encoding Utilities
- Error Handling Helpers
- Monitoring and Metrics
- Health Checks
- Performance and Profiling
- Caching Strategies and Utilities
- Development and Debugging Helpers
- Cross‑Platform Abstractions (Node & Workers)
- Security Considerations
- Libraries and Modern Practices
- Proposed Implementation Outline (for this repo)
- Testing Strategy
- Performance Optimization Opportunities
- Phase 8 Checklist
- Notes Tied to This Repo

---

## Overview and Goals

Goals for Phase 8:
- Provide robust, structured logging with correlation IDs and redaction.
- Offer crypto primitives using Web Crypto where possible; wrap sensitive operations to prevent misuse.
- Deliver validation/sanitization helpers for inputs, headers, URLs, and payloads.
- Standardize HTTP request/response helpers around the Fetch API for isomorphism.
- Add date/time and string utilities to ensure consistent formatting, parsing, and encoding.
- Introduce error types and serialization for consistent error handling and responses.
- Implement basic monitoring/metrics, health checks, and profiling hooks.
- Provide caching primitives (TTL, LRU, SWR) with pluggable backends.
- Keep utilities small, dependency‑light, and safe by default.

Non‑Goals:
- Building a full observability stack; we provide hooks and lightweight exporters.
- Implementing provider‑specific monitoring; instead, expose utility interfaces consumed by higher layers.

---

## Design Principles

- Prefer Web APIs: Use `globalThis.fetch`, `URL`, `Headers`, `crypto.subtle`, `TextEncoder/Decoder` for portability.
- Single interface, multiple implementations: Define small interfaces and provide Node/Worker adapters where the platform differs.
- Security by default: Redact sensitive fields, avoid insecure crypto modes, validate/normalize inputs, opt‑in verbose debug.
- Structured over unstructured: JSON logs and error payloads with stable field names.
- Minimal dependencies: Only introduce libraries when they reduce risk or complexity across both runtimes.
- Small, composable functions: Utilities should be trivial to test and mock.

---

## Structured Logging

Goals:
- JSON structured logs with levels: `trace`, `debug`, `info`, `warn`, `error`, `fatal`.
- Context propagation: request IDs, correlation IDs, component names, and span/measure IDs.
- Redaction: never log secrets, tokens, or PII. Provide automatic redaction for known field names.
- Cross‑runtime: Use `console` under the hood; avoid Node‑only transports in shared code.

Best practices:
- Log format: one JSON object per line; top‑level fields like `level`, `msg`, `ts`, `component`, `requestId`, `spanId`, `fields`, `err`.
- Error logging: include `err.name`, `err.code`, `err.message`, `err.stack?` (stack only in dev or at `debug` level), `cause.code?`.
- Correlation: generate a `requestId` per request and inject into a bound child logger.
- Sampling: allow sampling of `debug/trace` logs in production.
- Redaction: configurable list of keys to redact (e.g., `authorization`, `token`, `secret`, `password`, `set-cookie`).

Suggested interface:
```ts
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'

export interface LogFields { [k: string]: unknown }

export interface Logger {
  level: LogLevel
  child(bindings: LogFields): Logger
  log(level: LogLevel, msg: string, fields?: LogFields): void
  trace(msg: string, f?: LogFields): void
  debug(msg: string, f?: LogFields): void
  info(msg: string, f?: LogFields): void
  warn(msg: string, f?: LogFields): void
  error(msg: string, f?: LogFields | Error): void
  fatal(msg: string, f?: LogFields | Error): void
}
```

Implementation approach:
- Console JSON logger that formats a stable envelope and prints to `console[level]`.
- Allow a `pretty` dev mode that colorizes and truncates large objects.
- Add `withTimer()` helper returning `{ end(): void }` that logs `duration_ms` on completion.
- Optionally expose adapters to `pino` (Node) and use console in Workers; both should conform to the same `Logger` interface.

Cross‑runtime notes:
- Avoid `Buffer`; use `TextEncoder`/`Decoder`.
- Implement redaction as a shallow walk with a key allow/block list and size caps to prevent log explosion.

---

## Cryptographic Utilities

Goals:
- Provide safe wrappers for randomness, hashing, HMAC, HKDF, and AES‑GCM encryption/decryption using Web Crypto (`crypto.subtle`).
- Support base64url encoding/decoding, constant‑time comparisons, and key derivation.
- Make primitives misuse‑resistant with typed inputs/outputs and versioned envelopes.

Best practices:
- Randomness: use `crypto.getRandomValues` or `crypto.randomUUID()` (for IDs). Never use `Math.random()`.
- Hashing: `SHA‑256` via `subtle.digest` for general hashing; don’t roll your own password hashing (delegate to auth providers or use scrypt/argon2 via dedicated libs on Node only, if ever needed).
- HMAC: `SHA‑256` with `subtle.importKey('raw', k, { name: 'HMAC', hash: 'SHA-256' }, ...)`.
- HKDF: derive per‑purpose keys with salt and `info` context; maintain a key version.
- Symmetric encryption: AES‑256‑GCM with 12‑byte IV, unique nonce per message; include `aad` for context binding; envelope format should include version, algorithm, nonce, ciphertext.
- Constant‑time compare: avoid string equality for secrets; use HMAC verify or `timingSafeEqual` equivalent by comparing bytes on a fixed loop.

Suggested envelope:
```ts
// base64url(JSON.stringify({ v: 1, alg: 'A256GCM', iv, ct }))
type EncryptedEnvelopeV1 = {
  v: 1
  alg: 'A256GCM'
  iv: string // base64url
  ct: string // base64url (ciphertext contains tag implicitly in subtle, or separate if needed)
}
```

Implementation notes:
- Prefer Web Crypto everywhere. In Node 18+, use `crypto.webcrypto.subtle`.
- To keep cross‑runtime: avoid Node’s `createCipheriv` and `Buffer`; refactor existing `src/utils/crypto.ts` to a subtle‑based implementation with a small Node fallback only when necessary.
- Provide helpers: `randomBytes(len)`, `sha256(str|bytes)`, `hmac(key, data)`, `hkdf({ ikm, salt, info, len })`, `aesGcmEncrypt`, `aesGcmDecrypt`, `base64urlEncode/Decode`.
- Add `KeyManager` abstraction to load symmetric keys from env/secret manager (link to Phase 6) and rotate using key IDs.

Security footguns to avoid:
- Nonce reuse in AES‑GCM; enforce random 96‑bit IVs and never accept caller‑provided IVs unless expert mode.
- Logging keys or raw ciphertext; redact.
- Homegrown password hashing; if needed, use argon2 in Node with explicit configs; not supported in Workers runtime.

---

## Validation and Sanitization

Goals:
- Validate external inputs early; sanitize strings, header values, paths, and URLs.
- Offer small, composable validators for common patterns.

Patterns:
- Type guards: `isNonEmptyString`, `isRecord` (already present), `isStringArray`, `isSafeHeaderName`, `isSafeHeaderValue`.
- String normalization: trim, collapse whitespace, Unicode normalization (`NFKC`), lower/upper‑casing where appropriate.
- URL/Path safety: reject control chars, normalize `..` segments, allow only absolute HTTPS or relative paths by policy.
- ID formats: `isUUID`, `isBase64url`, `isHex`.
- Content limits: enforce max lengths for untrusted inputs.

Schema validation:
- If adopting a schema library, prefer `zod` or `valibot` for isomorphic usage; wrap in `validate(schema, value)` helpers so the rest of the code doesn’t depend on a specific library.

Sanitization helpers:
- `sanitizeForLog(obj, opts)`: redacts sensitive keys and limits object depth/size.
- `sanitizeHeaderValue(value)`: strips CR/LF and non‑printable characters; cap length.
- `sanitizeFilename(name)`: whitelist allowed characters, replace others with `-`.

---

## HTTP Utilities

Goals:
- Normalize request/response handling over the Fetch API model.
- Provide helpers for JSON, text, redirects, headers, cookies, CORS, and security headers.

Helpers:
- Responses: `json(body, { status, headers })`, `text(body, opts)`, `noContent()`, `redirect(url, status=302)`.
- Headers: `mergeHeaders(base, extra)`, `setSecurityHeaders(res)`, `vary(res, fields)`.
- CORS: `cors(origin, methods, headers, credentials?)` returning a headers object to merge for preflight and simple responses.
- ETag: `weakEtagFromBody(body)`, `fresh(reqHeaders, resHeaders)` to handle conditional GET.
- Cookies: minimal helpers to set cookies securely; in Workers use `Response.headers.append('Set-Cookie', ...)`.

Content handling:
- JSON serialization with stable casing and numeric precision. Avoid logging request bodies by default.
- Limit payload sizes at the router layer and by content‑length checks.

---

## Date/Time Utilities

Goals:
- Consistent UTC handling, ISO 8601 formatting, and duration parsing.

Helpers:
- `utcNow(): number` returning epoch ms.
- `toIso(ms|Date): string` and `fromIso(iso: string): number`.
- Duration parsing/formatting: parse `1h`, `15m`, `500ms` to ms; format ms to human readable.
- `deadline(msFromNow)`: returns `{ abortSignal, promise }` to cancel on timeout (works with Fetch).

---

## String and Encoding Utilities

Goals:
- Provide robust base64url, hex, utf8 conversions without Node‑specific APIs.

Helpers:
- `base64urlEncode(bytes)`, `base64urlDecode(str)`.
- `utf8Encode(str) -> Uint8Array`, `utf8Decode(bytes) -> string`.
- `slugify(str)`: lower‑case, replace spaces and disallowed chars.
- `safeJsonStringify(obj, maxDepth, maxLen)` with circular reference handling.

---

## Error Handling Helpers

Goals:
- Standardized error types with codes, HTTP status mapping, and safe serialization.

Error classes:
- `AppError` base: `{ code: string; message: string; status?: number; cause?: unknown; details?: Record<string, unknown> }`.
- `ValidationError`, `AuthError`, `ConfigError`, `UpstreamError`, `TimeoutError`, `RateLimitError` extend `AppError`.
- `HttpError` specialized for request handlers with `status` always present.

Serialization:
- `serializeError(err, { includeStackInDev }): { code, message, status, fields }` where `message` is user‑safe and fields omit secrets.
- `errorToResponse(err, logger)`: produces `Response` with JSON body and appropriate status and headers.

Recovery:
- Provide retry hints via headers (`Retry‑After`) and include correlation IDs in error responses when helpful.

---

## Monitoring and Metrics

Goals:
- Lightweight counters/histograms/timers with optional exporters.

Interface:
```ts
export interface Counter { inc(v?: number, labels?: Record<string, string>): void }
export interface Histogram { observe(v: number, labels?: Record<string, string>): void }
export interface MetricsRegistry {
  counter(name: string, help?: string, labels?: string[]): Counter
  histogram(name: string, help?: string, buckets?: number[], labels?: string[]): Histogram
}
```

Backends:
- Node: Prometheus text exporter endpoint (e.g., `/metrics`) or StatsD/OTel exporters.
- Workers: accumulate in memory and periodically log a compact JSON snapshot; optionally integrate Workers Analytics Engine.

Integration:
- Timer helper: `withMetricsTimer(hist, fn)` wraps an async function and records duration and success/failure.
- Hook into routing (Phase 4) and OAuth endpoints (Phase 7) to record latencies, error counts, and retries.

---

## Health Checks

Goals:
- Liveness, readiness, and startup probes with dependency checks.

Registry pattern:
```ts
type HealthStatus = 'ok' | 'warn' | 'critical'
type HealthCheck = () => Promise<{ status: HealthStatus; reason?: string; latency_ms?: number }>

export interface HealthRegistry {
  register(name: string, check: HealthCheck): void
  runAll(): Promise<Record<string, ReturnType<HealthCheck>>> // name → result
}
```

Checks:
- Config loaded and valid; required secrets present.
- Token encryption key available and decrypt‑encrypt roundtrip works.
- Upstream reachability for critical providers (with tight timeouts and caching to avoid thundering herd).
- Event loop lag (Node) within limits.

Expose endpoint:
- `/health/live` (always minimal), `/health/ready` (runs checks with small budgets), `/health/startup` (runs more expensive checks on boot).

---

## Performance and Profiling

Goals:
- Measure key code paths, detect hot spots, and monitor event loop health.

Helpers:
- `measure(name, fn)` using `performance.now()` and `performance.mark/measure` where available.
- Node: optional `monitorEventLoopDelay()` from `perf_hooks` (guarded behind feature detect), GC stats via `PerformanceObserver`.
- Expose a lightweight in‑process profiler toggle in dev that logs slow operations over a threshold (e.g., >100ms).

---

## Caching Strategies and Utilities

Goals:
- Reduce latency and load via safe caching primitives with predictable invalidation.

Cache interface:
```ts
export interface Cache<K, V> {
  get(key: K): V | undefined
  set(key: K, value: V, ttlMs?: number): void
  delete(key: K): void
  clear(): void
}
```

Patterns:
- TTL cache: per‑item expiration.
- LRU cache: cap memory usage; evict least‑recently used.
- Stale‑While‑Revalidate (SWR): serve stale within a window while refreshing in background.
- Request cache: deterministic key from method + URL + headers subset.

Backends:
- In‑memory Map/LRU for single‑instance Node and Workers.
- Pluggable adapters for Redis/Memcached (Node only) via a thin wrapper; keep interface the same.

Invalidation:
- Key versioning; include inputs in the key (e.g., config version, provider ID).
- Time‑based TTL with jitter to avoid stampedes.

---

## Development and Debugging Helpers

Goals:
- Improve local iteration and safe diagnostics without leaking secrets.

Helpers:
- `debugEnabled()` sourced from env flags; runtime‑switchable level.
- `dump(obj, opts)` pretty prints sanitized objects (dev only).
- `traceId()` and `bindRequestContext()` to attach IDs to logs and metrics.
- Feature flag helper: `feature(name, default)` reads config/env safely.
- Small HTTP “echo” route in dev to introspect headers and environment (behind a dev flag only).

---

## Cross‑Platform Abstractions (Node & Workers)

Approach:
- Centralize runtime detection in a tiny `runtime` module already present (`src/runtime/node.ts`, `src/runtime/worker.ts`).
- Keep shared code on Web APIs: Fetch, URL, Headers, TextEncoder/Decoder, crypto.subtle.
- Provide optional Node‑only exporters/adapters under `src/runtime/node‑only/` to avoid polluting shared paths.

Pitfalls and mitigations:
- Node Buffers: avoid in shared code; convert to `Uint8Array` and use Web APIs.
- Timers and performance: prefer `performance.now()` over `Date.now()` for durations.
- Workers storage: avoid in‑memory cross‑request state; use Durable Objects/KV when persistence is needed. For health checks/metrics, keep intervals minimal.

---

## Security Considerations

- Redaction: logger redacts known secret keys and limits payload sizes.
- Crypto hygiene: AES‑GCM with unique IVs; key derivation via HKDF; avoid nonce reuse; maintain key IDs and rotation.
- Constant‑time comparisons for secrets: HMAC verification or bytewise compare over full length.
- Input validation: normalize and constrain lengths; reject control chars; use allow‑lists for headers and CORS origins.
- HTTP headers: strict security headers (CSP where applicable, frame‑ancestors none for admin pages, Referrer‑Policy, X‑Content‑Type‑Options, Strict‑Transport‑Security for TLS deployments).
- Error responses: avoid leaking stack traces in prod; include correlation IDs.
- Cache safety: do not cache responses with user‑specific or sensitive data unless explicitly controlled; set `Cache‑Control` appropriately.

---

## Libraries and Modern Practices

- Logging: `pino` (Node) for performance and JSON; console logger fallback for Workers. `pino-http` for request logging (Node only).
- Metrics/Tracing: OpenTelemetry API (`@opentelemetry/api`) when a full stack is desired; otherwise custom lightweight registry.
- Validation: `zod` or `valibot` for schemas; `validator.js` for string checks (Node). Keep optional and behind thin wrappers.
- Crypto/JWT: `jose` (already used in repo) for JWT and JWKS. For encryption, prefer Web Crypto wrappers.
- Caching: `lru-cache` (Node) for a robust LRU; simple Map‑based LRU for Workers.
- Date/time: `luxon` or `date-fns` if richer features are needed; otherwise keep tiny helpers.

All libraries should be optional and isolated behind interfaces to preserve Workers compatibility.

---

## Proposed Implementation Outline (for this repo)

New/updated modules under `src/utils/`:
- `src/utils/logging.ts` (refactor): implement `Logger` interface with JSON structured logs, child bindings, redaction.
- `src/utils/crypto.ts` (refactor): replace Node `createCipheriv` usage with Web Crypto–based AES‑GCM/HKDF/HMAC; add base64url utilities.
- `src/utils/validators.ts` (extend): add URL/header/path validators, UUID/base64url/hex checks, length guards, sanitizers.
- `src/utils/http.ts`: helpers for `json()`, `text()`, `redirect()`, `mergeHeaders()`, `setSecurityHeaders()`, `cors()`.
- `src/utils/datetime.ts`: `utcNow()`, `toIso()`, `fromIso()`, `parseDuration()`, `formatDuration()`.
- `src/utils/strings.ts`: encoding/decoding, slugify, safe stringify.
- `src/utils/errors.ts`: `AppError`, derived classes, `serializeError()`, `errorToResponse()`.
- `src/utils/metrics.ts`: minimal metrics registry (counters/histograms) with Node/Worker exporters.
- `src/utils/health.ts`: health registry and result formatting for `/health/*` routes.
- `src/utils/perf.ts`: `measure()` helper and slow‑op logger; optional Node event loop delay probe.
- `src/utils/cache/ttl-cache.ts`: small TTL cache; `cache/swr.ts` for stale‑while‑revalidate; interface for pluggable backends.
- `src/utils/debug.ts`: dev helpers: `debugEnabled()`, `dump()` (sanitized), request context binding.

Integration points:
- Update `src/server/master-server.ts` to use `setSecurityHeaders()` and hook health endpoints.
- Instrument routing (Phase 4) with timers and metrics via `withMetricsTimer()`.
- Ensure OAuth flow (Phase 7) uses `Logger.child({ flowId, provider })` and `errorToResponse()`.
- Replace direct `console.log` in the codebase with the new `Logger` where feasible.

Example snippets (isomorphic):
```ts
// src/utils/base64url.ts (inline in strings/crypto if small)
export function base64urlEncode(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  const b64 = btoa(s)
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}
export function base64urlDecode(s: string): Uint8Array {
  s = s.replace(/-/g, '+').replace(/_/g, '/')
  const pad = s.length % 4 ? 4 - (s.length % 4) : 0
  const b64 = s + '='.repeat(pad)
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

// src/utils/crypto.ts (sketch)
export async function sha256(data: Uint8Array | string): Promise<Uint8Array> {
  const enc = typeof data === 'string' ? new TextEncoder().encode(data) : data
  const d = await (globalThis.crypto as Crypto).subtle.digest('SHA-256', enc)
  return new Uint8Array(d)
}

export async function aesGcmEncrypt(plain: Uint8Array, keyBytes: Uint8Array, aad?: Uint8Array) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt'])
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, key, plain)
  return { iv, ct: new Uint8Array(ct) }
}

// src/utils/logging.ts (sketch)
export function createConsoleLogger(component: string, level: LogLevel): Logger {
  const base = { component }
  function emit(l: LogLevel, msg: string, fields?: LogFields) {
    const ts = new Date().toISOString()
    const rec = { level: l, ts, msg, ...base, ...(fields || {}) }
    // eslint-disable-next-line no-console
    ;(console as any)[l === 'warn' || l === 'error' || l === 'fatal' ? 'error' : 'log'](JSON.stringify(rec))
  }
  const api: Logger = {
    level,
    child(bindings) { return createConsoleLogger(component, level).child(bindings) },
    log: emit,
    trace: (m, f) => emit('trace', m, f),
    debug: (m, f) => emit('debug', m, f),
    info: (m, f) => emit('info', m, f),
    warn: (m, f) => emit('warn', m, f),
    error: (m, f) => emit('error', m, f as LogFields),
    fatal: (m, f) => emit('fatal', m, f as LogFields),
  }
  return api
}
```

---

## Testing Strategy

Unit tests:
- Logging: validate JSON structure, level filtering, child bindings, and redaction behavior.
- Crypto: test vectors for `sha256`, HMAC, HKDF, and encryption round‑trip; ensure nonce uniqueness; corrupted data fails to decrypt.
- Validation: property‑based tests for string/URL sanitizers; ensure no control chars pass.
- HTTP: verify headers, CORS policies, ETag freshness logic; ensure `errorToResponse()` maps codes to statuses.
- Date/time: boundary testing for parsing/formatting and duration conversions.
- Strings: base64url round‑trips and large payload handling caps.
- Metrics: counters/histograms update correctly; exporters emit expected formats.
- Cache: TTL expiry and SWR refresh behavior; ensure no stale forever; stampede protections.

Cross‑runtime tests:
- Run selected tests with a Workers‑compatible runtime (e.g., Miniflare) and Node to ensure API parity where feasible.

Fuzzing/security tests:
- Fuzz validate/sanitize helpers with random inputs.
- Negative tests for error serialization to ensure no secrets leak.

---

## Performance Optimization Opportunities

- Logging: lazy JSON serialization (avoid serializing large objects unless at `debug` level); cap field sizes.
- Crypto: reuse imported keys when encrypting/decrypting multiple payloads; pool TextEncoder/Decoder.
- HTTP: prefer streaming for large bodies; conditional requests (ETag) to save bandwidth.
- Metrics: batch exports; avoid hot‑path locks; precompute label sets.
- Cache: jitter TTLs to avoid synchronized expirations; O(1) LRU updates.
- Date/time: prefer `performance.now()` for latency measurements; avoid `new Date()` in tight loops.

---

## Phase 8 Checklist

- Logging utilities with JSON format, child loggers, redaction, correlation IDs.
- Crypto utilities: random, sha256, HMAC, HKDF, AES‑GCM with versioned envelopes; base64url helpers.
- Validation/sanitization helpers: URL, header, path, ID formats; safe logging sanitizer.
- HTTP utilities: JSON/text responses, redirects, CORS, security headers, ETag.
- Date/time utilities: UTC now, ISO conversions, duration parse/format, deadlines.
- String utilities: base64url, UTF‑8 encode/decode, slugify, safe stringify.
- Error helpers: AppError hierarchy, serializer, error→response mapping.
- Monitoring/metrics: counters, histograms, timers; Node/Worker exporters.
- Health checks: registry with liveness/readiness/startup probes.
- Performance/profiling: measure helper, slow‑op logging, event loop lag on Node.
- Caching utilities: TTL, LRU, SWR, pluggable backends.
- Debug/dev helpers: dump with redaction, feature flags, request context.
- Cross‑platform: strict use of Web APIs in shared code; Node‑only adapters isolated.

---

## Notes Tied to This Repo

- Existing files:
  - `src/utils/logger.ts` is currently a thin console wrapper with `DEBUG` gating. It should be refactored to emit JSON structured logs with levels, child context, and redaction.
  - `src/utils/crypto.ts` uses Node `createCipheriv`/`Buffer`, making it Node‑only. For cross‑runtime support, migrate to Web Crypto (`crypto.subtle`) and provide base64url helpers. Add HKDF/HMAC utilities and a versioned envelope.
  - `src/utils/validators.ts` has basic guards. Extend with URL/header/path/ID validators and sanitizers.
- Runtime adapters already exist (`src/runtime/node.ts`, `src/runtime/worker.ts`). Use them to centralize feature detection and keep utilities portable.
- Instrument routing (Phase 4), auth flows (Phases 2 & 7), and config loading (Phase 6) with the new logging/metrics to gain observability without coupling to specific frameworks.

