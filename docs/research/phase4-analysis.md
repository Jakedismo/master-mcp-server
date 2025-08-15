# Phase 4: Request Routing System — Research & Design Analysis

This document provides a practical, implementation-focused analysis for Phase 4 of the Master MCP Server: the Request Routing System. It is grounded in the current codebase (Phases 1–3) and proposes cross‑platform patterns that work in both Node.js and Cloudflare Workers.

Contents
- Overview and Goals
- Architecture and Collaborators
- Request Transformation Patterns
- Authentication Integration
- Retry Strategies
- Circuit Breaker Pattern
- Load Balancing Strategies
- Health Monitoring
- Route Registry Design
- HTTP Communication Details
- Error Handling and Fallbacks
- Cross‑Platform Considerations (Node vs Workers)
- Modern Libraries and Patterns
- Performance Implications and Optimizations
- Security Considerations
- Testing Strategy Recommendations
- Suggested Implementation Structure
- Example Code Snippets

---

## Overview and Goals

Phase 4 elevates routing from the basic implementation in `src/modules/request-router.ts` to a robust, production‑ready Request Routing System with:
- Server extraction from prefixed names via the CapabilityAggregator
- Authentication header preparation via MultiAuthManager (supporting master_oauth, delegate_oauth, proxy_oauth, bypass_auth)
- Request transformation to each backend’s MCP HTTP shape
- HTTP communication, timeouts, retries with backoff and jitter
- Circuit breaker for unhealthy servers with half‑open probing
- Load balancing across multiple server instances
- Health‑aware dynamic routing and fallback

Key outcomes:
- Resilient routing under partial outages or slow upstreams
- Clear error propagation and graceful degradation
- Cross‑platform compatibility (Node and Workers) without Node‑only dependencies in routing code

---

## Architecture and Collaborators

Primary components and their responsibilities:
- RequestRouter (new advanced version for Phase 4)
  - Entry point for routing MCP calls (tools/resources)
  - Extracts server ID via CapabilityAggregator mappings
  - Prepares auth via MultiAuthManager
  - Applies retry and circuit breaker policies
  - Delegates instance selection to RouteRegistry
- RouteRegistry (new)
  - Maintains dynamic route mappings, instance lists, weights, and health states
  - Provides load‑balancing selection and fallback resolution
  - Tracks circuit breaker state per instance
- CapabilityAggregator (existing)
  - Maps aggregated names to original names and `serverId`
  - Discovers and caches capabilities
- ModuleLoader (existing)
  - Manages server lifecycle and provides `LoadedServer` metadata and health checks
- MultiAuthManager (existing)
  - Prepares appropriate authentication for backend calls, including OAuth delegation

Data flow on a typical `call_tool`:
1. Router resolves aggregated tool name → `{serverId, originalName}` via CapabilityAggregator
2. Router asks MultiAuthManager for auth headers or a delegation flow
3. Router asks RouteRegistry for a healthy instance of `serverId` (with load balancing)
4. Router transforms the generic MCP request into the backend HTTP shape and forwards via `fetch`
5. RouteRegistry updates health stats from success/failure and adjusts circuit breakers

---

## Request Transformation Patterns

Inputs (client → master):
- `CallToolRequest`: `{ name: 'serverId.toolName', arguments?: {...} }`
- `ReadResourceRequest`: `{ uri: 'serverId.resourceUri' }`

Transformations:
- Extract `serverId` and the original name/URI using CapabilityAggregator mappings:
  - Prefer `aggregator.getMappingForTool(name)` and `aggregator.getMappingForResource(uri)`
  - Fall back to first‑segment split (`serverId = before first '.'`) if mapping is missing
- Rewrite into backend payloads:
  - Call tool: `{ name: originalName, arguments }`
  - Read resource: `{ uri: originalUri }`
- Resolve backend HTTP endpoints:
  - Tools: default `POST /mcp/tools/call`
  - Resources: default `POST /mcp/resources/read`
  - Keep these configurable via RouterOptions

Notes:
- Keep the shape consistent with existing code (`src/modules/request-router.ts`), but introduce the mapping calls to avoid incorrect string splits.
- Prefer JSON payloads; set `content-type: application/json`.

---

## Authentication Integration

Router must integrate with all four strategies via `MultiAuthManager.prepareAuthForBackend(serverId, clientToken)`:
- master_oauth: pass through master token (e.g., `Authorization: Bearer <clientToken>`)
- delegate_oauth: returns an `OAuthDelegation` object; router must surface this to the client instead of calling the backend
- proxy_oauth: use stored/refreshable server‑specific access token; fall back to pass through if needed
- bypass_auth: forward with no auth headers

Proposed contract:
- If `prepareAuthForBackend` returns `AuthHeaders`, proceed to `forwardRequest`
- If it returns `OAuthDelegation`, return a structured response to the client; suggested shape for `CallToolResult`:
  ```json
  {
    "content": {
      "type": "oauth_delegation",
      "delegation": { ...OAuthDelegation }
    }
  }
  ```
- For `read_resource`, delegation usually doesn’t make sense; if encountered, return an error or an instruction document as above.

Security:
- Never echo client tokens in logs
- Use a header allowlist when forwarding to prevent header smuggling
- Consider per‑server scopes validation when available (optional)

---

## Retry Strategies

Goals:
- Handle transient network failures, 5xx, and 429 with exponential backoff + jitter
- Respect idempotency: `read_resource` is safe; `call_tool` may be non‑idempotent — default to conservative retries and let the backend/tool declare idempotence when available (future work)

Recommended policy defaults:
- maxRetries: 2 (read) / 1 (call)
- baseDelay: 100ms; exponential factor: 2
- jitter: full jitter (random 0..delay)
- retry on: network errors, `>=500`, `429`, `408`
- no retry on: `>=400` (except `408`/`429`), `401/403` auth errors

Implementation pattern:
- Wrap `fetch` in `retryWithBackoff(fn, policy)` that uses AbortController for per‑attempt timeout
- Make policy configurable per method

---

## Circuit Breaker Pattern

Why:
- Avoid hammering unhealthy servers, reduce tail latency, and accelerate failover

States and transitions:
- Closed: all requests flow; count failures; if failure threshold exceeded within rolling window, transition Open
- Open: block requests immediately and fail fast; after `halfOpenAfter` duration, transition Half‑Open
- Half‑Open: allow a limited number of probe requests; on success, close; on failure, re‑open

Design considerations:
- Maintain one breaker per server instance (not per serverId) inside RouteRegistry
- Use only platform‑portable APIs (timers, Date.now, AbortController)
- Record a small window of recent results (e.g., fixed counters with timestamped reset)

Default parameters:
- failureThreshold: 5 failures
- rollingWindowMs: 10_000
- halfOpenAfterMs: 15_000
- maxHalfOpenRequests: 1–2

---

## Load Balancing Strategies

Available strategies:
- Round‑robin: simplest; good default
- Weighted round‑robin: weigh instances by static weight or dynamic health score
- Health‑aware: exclude Open breakers and prefer instances with lower recent error rates/latencies

Practical default:
- Health‑aware round‑robin: iterate instances in round‑robin order but skip those with Open breaker; optionally prefer lower error rate

---

## Health Monitoring

Types:
- Passive: observe success/failure/latency of live traffic to update health
- Active: periodic `ModuleLoader.performHealthCheck` or a custom health checker

Platform notes:
- Node: `setInterval` acceptable for active checks
- Workers: prefer Cloudflare Cron Triggers or Durable Object timers; otherwise rely on passive signals

Integration:
- RouteRegistry stores per‑instance health: lastSeenOk, recentFailureCount, avgLatency (EMA)
- ModuleLoader’s health checks can update RouteRegistry periodically when available

---

## Route Registry Design

Responsibilities:
- Map routes to serverId using CapabilityAggregator mappings
- Track server instances for each serverId (support multiple endpoints)
- Maintain per‑instance breaker state and health metrics
- Provide instance selection API with load balancing and fallback
- Cache mappings and allow invalidation on capability refresh

Data model (conceptual):
```ts
type InstanceId = string; // endpoint URL or synthetic ID

interface InstanceInfo {
  id: InstanceId
  endpoint: string
  weight: number
  breaker: CircuitBreaker
  recentFailures: number
  lastOkTs: number
  avgLatencyMs: number
}

interface RouteRegistryState {
  // serverId → instances
  instances: Map<string, InstanceInfo[]>
  // serverId → RR cursor
  cursor: Map<string, number>
  // cached mappings from aggregator (tool/resource)
  toolMap: Map<string, { serverId: string; originalName: string }>
  resourceMap: Map<string, { serverId: string; originalUri: string }>
}
```

APIs:
- `updateFromAggregator(aggregator, servers)` — rebuild maps
- `resolveTool(name)`/`resolveResource(uri)` — return `{ serverId, original }`
- `selectInstance(serverId)` — returns a healthy instance or throws
- `reportResult(instanceId, success, latencyMs)` — updates health and breaker

---

## HTTP Communication Details

Requirements:
- Use `fetch` (Node 18+ and Workers compatible); avoid Node‑specific clients in routing
- Add per‑request timeout via AbortController
- Set `content-type: application/json` and `accept: application/json`
- Avoid redirect following by default (`redirect: 'manual'`) to prevent unintended token leakage
- On non‑2xx, read error body for diagnostics but do not retry on client errors (except 408/429)

---

## Error Handling and Fallbacks

Error classes:
- Transport errors: timeouts, network failures → retry, update breaker, possible failover
- Server errors (5xx): retry per policy; update breaker
- Auth errors (401/403): do not retry; surface error; consider refreshing on proxy_oauth (TokenManager handles refresh)
- Not found/invalid input (4xx): surface upstream error content

Surface to client:
- For `call_tool`: return `{ isError: true, content: { error: string, code?: string, details?: any } }`
- For OAuth delegation: return `{ content: { type: 'oauth_delegation', delegation } }`

Fallbacks:
- On instance failure, try next healthy instance per selection policy (respect breaker states)
- If no instances healthy, return a clear error including last observed reason and link to serverId

---

## Cross‑Platform Considerations (Node vs Workers)

- Use only Web platform APIs in routing core: `fetch`, `AbortController`, `URL`, timers
- Do not import Node modules (e.g., `node:crypto`) in routing layer; existing `utils/crypto.ts` is Node‑specific but unused here
- Cloudflare Workers: no custom agents; keep default connection reuse behavior
- Node: Undici backs `fetch`; per‑request `keepalive` is default; custom Agent optional but keep out of shared code
- Scheduling: avoid `setInterval` in Workers; prefer passive signals or external schedulers (Cron)

---

## Modern Libraries and Patterns

When allowed, the following can accelerate implementation:
- cockatiel: TS resilience toolkit with retry, circuit breaker, bulkhead; browser‑compatible
  - Pros: rich policies; portable; composable
  - Cons: adds dependency
- opossum: robust circuit breaker for Node; not ideal for Workers
- p-retry: small retry wrapper (Node/browser)
- ky: fetch wrapper with retry; browser‑first, can work with Node; less control over CB
- lru-cache: in‑memory caching for mappings and health snapshots

Given cross‑platform goals, a small in‑house implementation for retry + CB is reasonable (see snippets) or use `cockatiel` if introducing a dependency is acceptable.

---

## Performance Implications and Optimizations

- Minimize routing overhead:
  - Use CapabilityAggregator maps instead of repeated string splitting
  - Cache route resolutions in RouteRegistry (tool/resource → serverId) with invalidation on capability refresh
- Reduce tail latency:
  - Per‑request timeout (e.g., 5s default) and fail fast on Open breaker
  - Health‑aware selection to avoid slow instances
- Control concurrency:
  - Optional per‑server concurrency limits (future work) to avoid queue buildup
- Keep payloads small:
  - Only forward necessary headers; avoid copying cookies
- Avoid tight retry loops:
  - Add jitter to backoff to prevent thundering herds after failures

---

## Security Considerations

- Header allowlist: forward only `authorization`, `content-type`, `accept`, and any per‑server custom headers; drop `cookie`, `x-forwarded-*` unless explicitly needed
- Token handling:
  - Never log tokens or PII; redact Authorization in logs
  - Prefer bearer tokens in headers, not query params
- Endpoint allowlist:
  - Only route to endpoints discovered/registered via ModuleLoader config; prevent SSRF by rejecting arbitrary URLs
- TLS enforcement:
  - Prefer `https` endpoints for remote servers; allow `http://localhost` for local dev
- Input validation:
  - Validate tool/resource names; reject malformed prefixes; size‑limit arguments payloads
- Redirects:
  - Use `redirect: 'manual'` unless a provider requires otherwise

---

## Testing Strategy Recommendations

Unit tests:
- Route resolution: mapping tool/resource to serverId via aggregator maps and fallback
- Retry logic: verify backoff/jitter timing with fake timers; classification of retryable statuses
- Circuit breaker: state transitions Closed→Open→Half‑Open→Closed with probes
- Load balancing: round‑robin cursors and health‑aware skipping of Open instances
- Auth integration: prepareAuthForBackend returns both headers and delegation; router behavior for each

Integration tests:
- Mock upstream servers (tests/fixtures) returning various statuses (200, 401, 429, 5xx) and timeouts
- Multi‑instance routing with one unhealthy instance; ensure failover
- OAuth delegation path: ensure delegation content is returned and no upstream call is made

Workers compatibility tests:
- Use Miniflare (or a lightweight worker shim) to run routing code in a Worker‑like environment and validate fetch + AbortController behavior

Load and chaos tests:
- Burst traffic to validate breaker opening and recovery
- Latency injection to test health‑aware selection

---

## Suggested Implementation Structure

New folder (Phase 4):
```
src/routing/
  request-router.ts        # Phase 4 router (supersedes modules/request-router.ts)
  route-registry.ts        # Instances, mappings, health, LB
  policies/
    retry.ts               # Retry helpers
    circuit-breaker.ts     # Minimal cross-platform breaker
    load-balancer.ts       # Strategy interfaces + default RR/weighted
```

Interfaces (high‑level):
- `RouteRegistry.updateFrom(aggregator, servers)`
- `RouteRegistry.resolveTool(name)` / `resolveResource(uri)`
- `RouteRegistry.selectInstance(serverId)`
- `RouteRegistry.report(instanceId, { success, latencyMs })`

Router constructor:
```ts
constructor(
  private readonly aggregator: CapabilityAggregator,
  private readonly moduleLoader: DefaultModuleLoader,
  private readonly multiAuth: MultiAuthManager,
  private readonly registry: RouteRegistry,
  private readonly options?: RouterOptions
) {}
```

---

## Example Code Snippets

The following snippets illustrate portable patterns compatible with Node and Workers. Adapt names to the project’s types.

### 1) Retry with exponential backoff and jitter

```ts
export interface RetryPolicy {
  retries: number
  baseDelayMs: number
  maxDelayMs: number
  factor: number // e.g., 2
  jitter: 'full' | 'none'
  timeoutPerAttemptMs: number
  retryOn: (err: unknown, res?: Response) => boolean
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    if (signal) {
      const onAbort = () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')) }
      signal.addEventListener('abort', onAbort, { once: true })
    }
  })
}

export async function retryWithBackoff<T>(fn: (signal: AbortSignal) => Promise<T>, policy: RetryPolicy): Promise<T> {
  let attempt = 0
  let delay = policy.baseDelayMs
  while (true) {
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), policy.timeoutPerAttemptMs)
    try {
      return await fn(ac.signal)
    } catch (err: any) {
      const res = err?.response as Response | undefined
      if (attempt >= policy.retries || !policy.retryOn(err, res)) throw err
      attempt++
      clearTimeout(timer)
      const j = policy.jitter === 'full' ? Math.random() * delay : delay
      await sleep(Math.min(delay, policy.maxDelayMs))
      delay = Math.min(delay * policy.factor, policy.maxDelayMs)
    } finally {
      clearTimeout(timer)
    }
  }
}
```

Usage in router:
```ts
const policy: RetryPolicy = {
  retries: isRead ? 2 : 1,
  baseDelayMs: 100,
  maxDelayMs: 1500,
  factor: 2,
  jitter: 'full',
  timeoutPerAttemptMs: 5000,
  retryOn: (err, res) => {
    if (res) return res.status >= 500 || res.status === 429 || res.status === 408
    return true // transport error
  },
}

const result = await retryWithBackoff(async (signal) => {
  return await fetch(url, { method: 'POST', headers, body, signal })
}, policy)
```

### 2) Minimal cross‑platform Circuit Breaker

```ts
type BreakerState = 'closed' | 'open' | 'half_open'

export interface BreakerOptions {
  failureThreshold: number
  rollingWindowMs: number
  halfOpenAfterMs: number
  maxHalfOpenRequests: number
}

export class CircuitBreaker {
  private state: BreakerState = 'closed'
  private failures = 0
  private lastFailureTs = 0
  private halfOpenInFlight = 0

  constructor(private readonly opts: BreakerOptions) {}

  canRequest(): boolean {
    const now = Date.now()
    if (this.state === 'open') {
      if (now - this.lastFailureTs >= this.opts.halfOpenAfterMs) {
        this.state = 'half_open'
        this.halfOpenInFlight = 0
      } else {
        return false
      }
    }
    if (this.state === 'half_open') {
      return this.halfOpenInFlight < this.opts.maxHalfOpenRequests
    }
    return true
  }

  onSuccess(): void {
    this.failures = 0
    this.state = 'closed'
    this.halfOpenInFlight = 0
  }

  onFailure(): void {
    const now = Date.now()
    // reset rolling window
    if (now - this.lastFailureTs > this.opts.rollingWindowMs) this.failures = 0
    this.failures++
    this.lastFailureTs = now
    if (this.failures >= this.opts.failureThreshold) this.state = 'open'
  }

  markHalfOpenAttempt(): void {
    if (this.state === 'half_open') this.halfOpenInFlight++
  }

  getState(): BreakerState { return this.state }
}
```

Usage in selection:
```ts
// Before trying an instance
if (!inst.breaker.canRequest()) continue // skip to next instance
inst.breaker.markHalfOpenAttempt()
// After response
inst.breaker.onSuccess() // or onFailure()
```

### 3) RouteRegistry: health‑aware, round‑robin selection

```ts
export class RouteRegistry {
  private instances = new Map<string, InstanceInfo[]>()
  private cursor = new Map<string, number>()
  private toolMap = new Map<string, { serverId: string; originalName: string }>()
  private resourceMap = new Map<string, { serverId: string; originalUri: string }>()

  updateFrom(aggregator: CapabilityAggregator, servers: Map<string, LoadedServer>): void {
    this.toolMap.clear(); this.resourceMap.clear(); this.instances.clear()
    for (const s of servers.values()) {
      const list = (this.instances.get(s.id) ?? [])
      const breaker = new CircuitBreaker({ failureThreshold: 5, rollingWindowMs: 10_000, halfOpenAfterMs: 15_000, maxHalfOpenRequests: 1 })
      list.push({ id: s.endpoint, endpoint: s.endpoint, weight: 1, breaker, recentFailures: 0, lastOkTs: 0, avgLatencyMs: 0 })
      this.instances.set(s.id, list)
    }
    // Copy maps from aggregator if available
    // (Assuming aggregator exposes getMappingForTool/Resource per current codebase)
    // For fast path, also allow fallback by splitting on '.' if mapping is missing
  }

  resolveTool(name: string): { serverId: string; originalName: string } {
    // Prefer aggregator mapping
    // Fallback: split at first '.'
    const m = this.toolMap.get(name)
    if (m) return m
    const idx = name.indexOf('.')
    if (idx <= 0) throw new Error(`Invalid aggregated tool name: ${name}`)
    return { serverId: name.slice(0, idx), originalName: name.slice(idx + 1) }
  }

  selectInstance(serverId: string): InstanceInfo {
    const list = this.instances.get(serverId) ?? []
    if (!list.length) throw new Error(`No instances registered for ${serverId}`)
    const start = this.cursor.get(serverId) ?? 0
    for (let i = 0; i < list.length; i++) {
      const idx = (start + i) % list.length
      const inst = list[idx]
      if (inst.breaker.canRequest()) { this.cursor.set(serverId, (idx + 1) % list.length); return inst }
    }
    throw new Error(`No healthy instances for ${serverId}`)
  }

  report(instanceId: string, ok: boolean, latencyMs: number): void {
    for (const arr of this.instances.values()) {
      const inst = arr.find(i => i.id === instanceId)
      if (inst) {
        if (ok) {
          inst.breaker.onSuccess(); inst.lastOkTs = Date.now();
          inst.avgLatencyMs = inst.avgLatencyMs ? (inst.avgLatencyMs * 0.8 + latencyMs * 0.2) : latencyMs
        } else {
          inst.breaker.onFailure(); inst.recentFailures++
        }
        break
      }
    }
  }
}
```

### 4) Forwarding with auth, retry, and breaker integration

```ts
async function forwardJson(url: string, payload: any, headers: Record<string,string>, signal?: AbortSignal): Promise<Response> {
  return fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json', ...headers }, body: JSON.stringify(payload), redirect: 'manual', signal })
}

async function routeCallTool(req: CallToolRequest, clientToken: string) {
  const { serverId, originalName } = registry.resolveTool(req.name)
  const auth = await multiAuth.prepareAuthForBackend(serverId, clientToken)
  if ((auth as any).type === 'oauth_delegation') {
    return { content: { type: 'oauth_delegation', delegation: auth } }
  }
  const inst = registry.selectInstance(serverId)
  const url = new URL('/mcp/tools/call', inst.endpoint).toString()

  const start = Date.now()
  try {
    const res = await retryWithBackoff((signal) => forwardJson(url, { name: originalName, arguments: req.arguments ?? {} }, auth as Record<string,string>, signal), policy)
    const ok = res.ok && (res.headers.get('content-type')?.includes('json') ?? true)
    const body = ok ? await res.json() : { content: { error: `Upstream ${res.status}` }, isError: true }
    registry.report(inst.id, ok, Date.now() - start)
    if (!ok) return body
    return body as CallToolResult
  } catch (e) {
    registry.report(inst.id, false, Date.now() - start)
    return { isError: true, content: { error: String(e) } }
  }
}
```

---

## How This Improves the Current Router

Compared to `src/modules/request-router.ts`, the Phase 4 design adds:
- Explicit mapping via `CapabilityAggregator.getMappingForTool/Resource` instead of naive string splitting
- Integration with `MultiAuthManager.prepareAuthForBackend`, supporting all four strategies including OAuth delegation
- Robust retry with backoff/jitter and per‑attempt timeouts using AbortController
- Circuit breaker per instance with half‑open probing
- Health‑aware round‑robin load balancing and failover across instances
- Clear, structured error propagation and logging guidance

These changes preserve the simple endpoints (`/mcp/tools/call`, `/mcp/resources/read`) and remain portable across Node and Workers.

---

## Appendix: Recommended Defaults

- Request timeouts: 5s per attempt; total under ~8–10s with retries
- Circuit breaker: 5 failures in 10s opens for 15s; 1 half‑open probe
- Retries: read 2, call 1; retry on transport, 5xx, 408, 429
- Load balancing: health‑aware round‑robin
- Headers forwarded: `authorization`, `content-type`, `accept`

---

## Next Steps

1) Implement `src/routing/policies/{retry.ts,circuit-breaker.ts}` using the snippets above
2) Implement `src/routing/route-registry.ts` that integrates with `CapabilityAggregator` and `ModuleLoader`
3) Implement `src/routing/request-router.ts` (Phase 4) and wire it in place of `src/modules/request-router.ts`
4) Extend tests in `tests/modules/request-router.test.ts` to cover retries, circuit breaker, delegation, and load balancing

