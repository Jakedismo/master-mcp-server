# Phase 6: Configuration System — Research & Design Analysis

This document analyzes Phase 6 for the Master MCP Server, focusing on designing a robust, secure, and flexible configuration system with multi‑environment support, strong validation, safe hot‑reload, and cross‑platform (Node.js and Workers) compatibility.

Contents
- Overview and Goals
- Configuration Schema Design
- Environment Management
- Security and Secrets Handling
- Hot‑Reload and Runtime Updates
- Configuration Sources and Merging
- Validation Strategies and Libraries
- Cross‑Platform Considerations (Node & Workers)
- Testing Strategy
- Proposed Implementation Outline (for this repo)
- Examples
- Phase 6 Checklist

---

## Overview and Goals

Goals for Phase 6:
- Build a comprehensive configuration schema with runtime validation and environment‑aware overrides.
- Support dev/staging/production deployments and environment variable injection.
- Implement safe hot‑reload for non‑critical settings with clear immutability boundaries.
- Enforce secure handling of secrets (no plaintext in repo; encryption/redaction).
- Keep compatibility across Node.js and Workers runtimes.

Key configuration areas:
- Master server hosting (ports, base URL, timeouts/limits)
- Authentication (master OAuth, per‑server strategies/config)
- Server definitions (sources, startup configs, env, ports)
- Routing and load balancing (retry, circuit breaker, strategies)
- Logging/observability levels and sinks
- Cross‑platform deployment controls (Node vs Workers)

---

## Configuration Schema Design

Principles:
- Explicit, strongly typed schemas with runtime validation. Types alone are insufficient; validate inputs at boundaries.
- Hierarchical composition with clear precedence: base → env → local overrides → env vars.
- Separation of mutable vs immutable settings: ports and server lists are immutable at runtime; log level and routing weights can be mutable.
- Transform to typed values: parse durations, byte sizes, and URLs during validation.
- Cross‑field constraints: validate dependent fields (e.g., if `auth_strategy=delegate_oauth`, require a valid provider config).

Recommended shapes (building on `src/types/config.ts`):
- Top‑level: `MasterConfig` (already present) with optional `routing`, `logging` sections.
- Add optional `limits?: { requestTimeoutMs?: number; maxConcurrent?: number; }` to hosting/routing where appropriate.
- For servers, prefer explicit `endpoint` when pre‑running servers; else infer from loader.

Schema design patterns:
- Single source of truth schemas used for both validation and developer types.
- Use discriminated unions for strategy‑specific sub‑schemas (e.g., `auth_strategy`).
- Provide sensible defaults in schema; override from files/env.

Examples (Zod‑style) are included below in the Examples section.

---

## Environment Management

Targets:
- Multiple environments: dev, staging, production (and local overrides).
- Environment variable loading and validation.
- Config encryption for sensitive values stored outside env vars.
- Hot‑reload for non‑critical settings.

Recommended layout and precedence:
1. `config/base.yaml` (checked in)
2. `config/{env}.yaml` (e.g., `dev.yaml`, `staging.yaml`, `prod.yaml`)
3. `config/local.yaml` (git‑ignored; developer machine overrides)
4. Environment variables (highest priority)

Notes:
- Prefer `APP_ENV` (dev|staging|prod) over overloading `NODE_ENV` for clarity.
- Use `.env` files for local development only; do not commit secrets. `dotenv-flow` can support `.env`, `.env.local`, `.env.prod` cascades.
- In Workers, there is no filesystem; inject environment via bindings/secrets or a bundled JSON export.

Environment variable mapping:
- Reserve a prefix (e.g., `MCP_`) to avoid collisions: `MCP_PORT`, `MCP_BASE_URL`, `MCP_MASTER_OAUTH_CLIENT_ID`, etc.
- Validate env vars at boot using a dedicated env schema (e.g., envalid/zod) and transform to typed values.

---

## Security and Secrets Handling

Principles:
- Never commit secrets. Primary channel for secrets is environment variables or a secret manager.
- Encrypt sensitive configuration at rest if stored outside env vars (e.g., in artifacts or remote stores), and decrypt only in memory.
- Redact secrets from logs and error messages.
- Support key rotation with minimal downtime.

Recommended sources for secrets (depending on deployment):
- Node (Docker/Koyeb): environment variables (injected by platform), or secret managers (AWS Secrets Manager, HashiCorp Vault, Azure/GCP equivalents).
- Cloudflare Workers: use `wrangler secret` bindings and per‑environment `vars`/`secrets`.

Encryption at rest:
- Use envelope encryption if integrating with KMS; otherwise use AES‑GCM with a 256‑bit key provided via an env var (e.g., `MCP_CONFIG_KEY`).
- Prefer platform crypto: Node `crypto.webcrypto.subtle` or Workers `crypto.subtle`.
- Store only ciphertext plus IV and auth tag; never persist plaintext.

Operational safety:
- Fail closed on decryption or validation failures.
- Provide explicit allow‑list of settings that can be changed at runtime.
- Maintain an audit trail for configuration version changes and secret key rotations (log IDs, not secret contents).

---

## Hot‑Reload and Runtime Updates

Goals:
- Enable updates for non‑critical settings without restarts (e.g., `logging.level`, routing weights, retry policy, some auth provider endpoints).
- Disallow hot changes that compromise correctness (e.g., port changes, server list topology) unless a coordinated restart occurs.

Mechanics (Node):
- File watcher (`chokidar`) on `config/*.yaml` and env‑backed reload triggers (e.g., SIGHUP) to re‑load and validate.
- Two‑phase apply: validate → stage → swap references atomically.
- Rollback: keep last‑known‑good snapshot and revert on failure.

Mechanics (Workers):
- No filesystem watchers; use versioned remote config (KV/Durable Object/remote HTTP) with periodic poll (ETag/version) or event‑driven updates.
- Apply same two‑phase apply and rollback semantics.

Concurrency safety:
- Treat config as an immutable snapshot object shared via atomic reference swap.
- Guard stateful subsystems with update hooks (e.g., router.updatePolicy, logger.setLevel).
- Debounce rapid changes; coalesce updates.

---

## Configuration Sources and Merging

Supported sources:
- File‑based: YAML/JSON/TOML (YAML already used in this repo).
- Environment variables: validated and transformed.
- Remote stores: HTTP/JSON, object storage, KV, or secret managers.

Merging rules (top to bottom precedence):
1. Base config
2. Env config
3. Local overrides
4. Env vars

Merging strategy:
- Deep‑merge objects; arrays default to replace unless explicitly marked for merge (e.g., `servers: !replace`). Keep it simple initially: array replace.
- Support `${ENV_VAR}` expansion in files. Resolve at load time with defaults `${ENV_VAR:-default}`. Do not allow command substitution or complex expressions.
- Optional `extends:` key to inherit from a base file; detect cycles.

---

## Validation Strategies and Libraries

Runtime validation is required. Viable approaches:

Libraries:
- Zod: developer‑friendly, great TypeScript inference, custom transforms, good DX. Ship schemas with code.
- Ajv (+ JSON Schema / TypeBox): standardized schema representation, good for external tooling and generated docs.
- Envalid: focused on env var validation; pairs well with Zod/Ajv for full config.
- Convict: opinionated config framework (schema + sources + env/argv overrides + formats). Mature but heavier.

Recommendations for this repo:
- Use Zod for in‑process validation and transforms (durations/bytes/URLs) with TypeScript types.
- Optionally generate JSON Schema from Zod for docs or remote validators if needed.
- Use Envalid or Zod for env var validation.

Validation patterns:
- Discriminated unions for `auth_strategy` and provider‑specific `auth_config`.
- Cross‑field refinement (e.g., when PROXY_OAUTH → require upstream base URL).
- Transform strings to typed values (URLs, numbers, durations) as part of schema parsing.

---

## Cross‑Platform Considerations (Node & Workers)

Constraints:
- Node: has filesystem, process env, timers, and native modules.
- Workers: no filesystem, no `process.env`, limited global APIs; use `env` bindings, KV, Durable Objects. `crypto.subtle` available.

Design:
- Keep loader logic split by capability: file loading in Node; remote/injected JSON in Workers.
- Abstract environment access: provide an `EnvProvider` interface with Node and Worker implementations.
- Avoid Node‑only dependencies in core paths (e.g., the validator and schema should be pure TS; only the Node loader uses `fs`).

Patterns:
- Detect runtime with feature checks, not string comparisons: `const isNode = typeof process !== 'undefined' && !!process.versions?.node`.
- Bundle default/base config for Workers as JSON, override via bindings and remote fetch.
- Replace file watchers with version polling or admin API triggers in Workers.

---

## Testing Strategy

Test levels:
- Unit: schema validation, env mapping, merging precedence, transforms (durations/bytes/URLs), cross‑field constraints.
- Integration: end‑to‑end load (file/env/remote), hot‑reload apply hooks to router/logger, failure/rollback behavior.
- Cross‑runtime: Node loader vs Worker loader stubs.

Techniques:
- Golden files: sample YAML for base/dev/staging/prod/local; assert resolved JSON.
- Property‑based tests: generate partial configs to ensure validator rejects/accepts as expected.
- Mutation tests for precedence: override same setting across layers and verify final value.
- Fault injection: unreadable file, invalid YAML, decryption failure, missing env var, remote 5xx/timeout.
- Thread‑safety: in Node, simulate concurrent reads while swapping config reference.

Coverage targets for Phase 6:
- 100% of validation branches for required sections and discriminated unions.
- 90%+ for merge/precedence logic and env expansion.

---

## Proposed Implementation Outline (for this repo)

Files to extend:
- `src/config/config-loader.ts`: expand to a full loader/validator with env resolution, deep‑merge, and Zod schemas.
- Add `src/config/config-manager.ts`: runtime holder with hot‑reload hooks and safe apply.
- `src/types/config.ts`: keep as canonical types; add optional limits/timeouts if needed.

Suggested responsibilities:
- `ConfigLoader`
  - Load: from YAML (Node), from injected JSON or remote (Workers), and from env.
  - Validate: Zod schemas with transforms and cross‑field refinements.
  - Resolve: `${ENV_VAR}` references and defaults.
  - Merge: base → env → local → env vars.
- `ConfigManager`
  - Hold current immutable snapshot.
  - Expose `subscribe` to notify subsystems on changes.
  - Apply updates with two‑phase validation and rollback.
  - Node: integrate `chokidar` and SIGHUP; Workers: polling/version triggers.
- Subsystem hooks
  - `RequestRouter.updatePolicy(newRouting)`
  - `Logger.setLevel(level)`
  - `MultiAuthManager.updateProviders(changes)` for safe provider tweaks.

Runtime safety policy:
- Mutable at runtime: `logging.level`, routing retry/backoff, circuit breaker thresholds, per‑server routing weights, some provider URLs/timeouts.
- Immutable at runtime (restart required): `hosting.port`, `hosting.platform`, server topology (`servers[]`), master OAuth client secrets, token encryption key.

---

## Examples

### 1) Zod Schemas with Transforms

```ts
// src/config/schemas.ts (proposed)
import { z } from 'zod'

const url = z.string().url()
const durationMs = z
  .union([z.number().int().nonnegative(), z.string()])
  .transform((v) => {
    if (typeof v === 'number') return v
    // Simple parse: support "250ms", "5s", "2m", "1h"
    const m = /^([0-9]+)\s*(ms|s|m|h)?$/.exec(v.trim())
    if (!m) throw new Error('Invalid duration')
    const n = Number(m[1]); const u = (m[2] || 'ms') as 'ms'|'s'|'m'|'h'
    return n * (u === 'ms' ? 1 : u === 's' ? 1000 : u === 'm' ? 60000 : 3600000)
  })

const LoggingSchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
})

const RetrySchema = z.object({
  maxRetries: z.number().int().min(0).max(10).default(2),
  baseDelayMs: durationMs.default(250),
  maxDelayMs: durationMs.default(4000),
  backoffFactor: z.number().min(1).max(10).default(2),
  jitter: z.enum(['none', 'full']).default('full'),
})

const CircuitBreakerSchema = z.object({
  failureThreshold: z.number().int().min(1).max(100).default(5),
  successThreshold: z.number().int().min(1).max(100).default(2),
  recoveryTimeoutMs: durationMs.default(30000),
})

const RoutingSchema = z.object({
  loadBalancer: z.object({ strategy: z.enum(['round_robin', 'weighted', 'health']).default('round_robin') }).default({}),
  retry: RetrySchema.default({}),
  circuitBreaker: CircuitBreakerSchema.default({}),
})

const MasterOAuthSchema = z.object({
  issuer: z.string().optional(),
  authorization_endpoint: url,
  token_endpoint: url,
  jwks_uri: url.optional(),
  client_id: z.string().min(1),
  client_secret: z.string().optional(),
  redirect_uri: url,
  scopes: z.array(z.string()).min(1),
  audience: z.string().optional(),
})

const ServerAuthConfigSchema = z.object({
  provider: z.enum(['github', 'google', 'custom']),
  authorization_endpoint: url,
  token_endpoint: url,
  client_id: z.string().min(1),
  client_secret: z.string().optional(),
  scopes: z.array(z.string()).optional(),
}).passthrough()

const ServerSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['git', 'npm', 'pypi', 'docker', 'local']),
  url: z.string().optional(),
  package: z.string().optional(),
  version: z.string().optional(),
  branch: z.string().optional(),
  auth_strategy: z.enum(['master_oauth', 'delegate_oauth', 'bypass_auth', 'proxy_oauth']),
  auth_config: ServerAuthConfigSchema.optional(),
  endpoint: z.string().url().optional(),
  config: z.object({
    environment: z.record(z.string()).default({}),
    args: z.array(z.string()).default([]),
    port: z.number().int().positive().optional(),
  }).default({}),
}).superRefine((s, ctx) => {
  if (s.auth_strategy !== 'bypass_auth' && !s.auth_config && s.type !== 'local') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'auth_config required for non-bypass strategies', path: ['auth_config'] })
  }
})

export const MasterConfigSchema = z.object({
  master_oauth: MasterOAuthSchema,
  servers: z.array(ServerSchema),
  oauth_delegation: z.object({
    enabled: z.boolean().default(false),
    callback_base_url: url.optional(),
    providers: z.record(ServerAuthConfigSchema).optional(),
  }).default({ enabled: false }),
  hosting: z.object({
    platform: z.enum(['node', 'cloudflare-workers', 'koyeb', 'docker', 'unknown']).default('node'),
    port: z.number().int().positive().optional(),
    base_url: url.optional(),
  }),
  routing: RoutingSchema.optional(),
  logging: LoggingSchema.optional(),
})

export type MasterConfig = z.infer<typeof MasterConfigSchema>
```

### 2) Env Var Validation (Envalid‑style)

```ts
import { cleanEnv, str, num, url } from 'envalid'

export function loadEnv() {
  return cleanEnv(process.env, {
    MCP_ENV: str({ choices: ['dev', 'staging', 'prod'], default: 'dev' }),
    MCP_PORT: num({ default: 3000 }),
    MCP_BASE_URL: url({ default: 'http://localhost:3000' }),
    MCP_MASTER_OAUTH_CLIENT_ID: str(),
    MCP_MASTER_OAUTH_CLIENT_SECRET: str({ default: '' }),
  })
}
```

### 3) Merge Order and Env Expansion (illustrative)

```ts
function deepMerge<T>(a: T, b: Partial<T>): T {
  // Keep simple: objects deep-merge, arrays replace
  if (Array.isArray(a) || Array.isArray(b)) return (b as any) ?? (a as any)
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return (b as any) ?? (a as any)
  const out: any = { ...a }
  for (const [k, v] of Object.entries(b)) {
    out[k] = k in out ? deepMerge((out as any)[k], v as any) : v
  }
  return out
}

function resolveEnvRefs(obj: any): any {
  if (obj == null) return obj
  if (typeof obj === 'string') {
    return obj.replace(/\$\{([A-Z0-9_]+)(:-([^}]*))?\}/g, (_m, name, _d, def) => {
      const v = (globalThis as any).process?.env?.[name] ?? def ?? ''
      return String(v)
    })
  }
  if (Array.isArray(obj)) return obj.map(resolveEnvRefs)
  if (typeof obj === 'object') {
    const out: any = {}
    for (const [k, v] of Object.entries(obj)) out[k] = resolveEnvRefs(v)
    return out
  }
  return obj
}
```

### 4) AES‑GCM Encryption Helper (Node/Workers compatible)

```ts
// Uses Web Crypto API available in Node 18+ and Workers
export async function encryptAesGcm(plaintext: Uint8Array, keyBytes: Uint8Array) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt'])
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext)
  return { iv: Buffer.from(iv).toString('base64'), data: Buffer.from(new Uint8Array(ct)).toString('base64') }
}

export async function decryptAesGcm(dataB64: string, ivB64: string, keyBytes: Uint8Array) {
  const iv = Uint8Array.from(Buffer.from(ivB64, 'base64'))
  const data = Uint8Array.from(Buffer.from(dataB64, 'base64'))
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt'])
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data)
  return new Uint8Array(pt)
}
```

---

## Phase 6 Checklist

- Configuration validation with schemas and cross‑field constraints
- Environment‑specific config files and env var overrides
- Secret handling via env/secret stores; optional encryption at rest
- Hot‑reload for non‑critical settings with atomic swap and rollback
- Support for file/env/remote config sources; deterministic merge order
- Cross‑platform loaders (Node filesystem, Workers bindings/remote)
- Comprehensive tests for loader, merge, env expansion, and validator

---

## Notes Tied to This Repo

- `src/types/config.ts` already defines key types; align Zod/validator fields to these interfaces (consider adding timeouts/limits if needed).
- `src/config/config-loader.ts` currently provides basic YAML/env loading. In Phase 6, expand it to:
  - Validate with a runtime schema (Zod or Ajv), not just shape checks.
  - Resolve `${VAR}` references and environment overrides with precedence.
  - Provide a `loadAll({ env, paths })` that returns the final resolved snapshot and a structured `ValidationReport` for logging.
  - Expose `mergeConfigs(base, override)` with deep‑merge for objects, replace for arrays.
- Introduce `ConfigManager` to hold current config and notify subsystems on safe updates. For Workers, prefer a small admin endpoint or version polling instead of file watch.

