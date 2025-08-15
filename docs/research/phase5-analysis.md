# Phase 5: Core Master Server — Research & Design Analysis

This document analyzes Phase 5 of the Master MCP Server, focused on implementing a complete MCP protocol handler and wiring together all major subsystems from Phases 1–4 into a production-ready master server. It is grounded in the current codebase and the project plan in `master-mcp-definition.md`.

Contents
- Overview and Goals
- MCP Protocol Compliance
- Protocol Handler Design
- Master Server Integration
- Configuration Management
- Lifecycle & Graceful Shutdown
- Error Handling Strategy
- Performance Considerations
- Monitoring & Observability
- Cross‑Platform Compatibility (Node & Workers)
- Testing Strategy
- Suggested Implementation Outline

---

## Overview and Goals

Phase 5 brings the system together:
- Implement a complete MCP Protocol Handler that supports tool and resource operations and integrates authentication.
- Wire MultiAuthManager, ModuleLoader, CapabilityAggregator, and RequestRouter into a cohesive Master Server.
- Establish a robust initialization and shutdown sequence with configuration loading and validation.
- Ensure errors and auth flows propagate correctly through all layers, with attention to performance and observability.

Key objectives:
- Single cohesive entry point for MCP clients with aggregated capabilities across backends.
- Strict separation of concerns: discovery (aggregator), routing (router), auth (multi‑auth), lifecycle (loader/server), protocol (handler).
- Cross‑platform design that compiles and runs on Node.js and Worker runtimes (Workers, Koyeb, Docker).

---

## MCP Protocol Compliance

Phase 5 requires finishing the protocol surface for the master server. Within this repo we maintain minimal MCP‑like types in `src/types/mcp.ts`:
- Tools: `list_tools`, `call_tool`
- Resources: `list_resources`, `read_resource`
- Subscriptions/notifications: `subscribe` (stub in router)

Compliance guidance:
- Initialization handshake (JSON‑RPC “initialize”): expose server name/version and capabilities. The master server can synthesize this response from the `CapabilityAggregator` once discovery completes. If running over HTTP rather than JSON‑RPC, provide `/capabilities` with a compatible JSON body (already supported by the aggregator’s discovery flow).
- Tools
  - `list_tools` returns aggregated tool definitions. Names must be globally unique. Use the existing prefixing strategy (`serverId.toolName`).
  - `call_tool` accepts aggregated names; the ProtocolHandler must resolve these to `{serverId, originalName}` via `CapabilityAggregator.getMappingForTool`, falling back to split‑by‑dot as a compatibility path.
- Resources
  - `list_resources` returns aggregated resource descriptors with prefixed URIs (e.g., `serverA.db.users`).
  - `read_resource` accepts aggregated URIs and resolves them via the aggregator mapping.
- Prompts (optional)
  - If backends report prompts in capabilities, include them in the master’s capabilities (even if the handler does not yet implement prompt RPCs). This prepares us for future `prompts/list` and `prompts/get` support.
- Subscriptions/Events
  - `subscribe` is scaffolded in the current router and can return `{ ok: true }`. True event streaming would arrive in later phases.

Error semantics and shapes should follow JSON‑RPC codes when the transport is JSON‑RPC, and the simplified result objects in `types/mcp.ts` when using HTTP. Recommended mapping:
- Invalid request/params → JSON‑RPC `-32600 / -32602` (HTTP 400 in REST‑style endpoints).
- Method not found → `-32601` (HTTP 404).
- Upstream/network failure → `-32000` range with details (HTTP 502/504 depending on context).
- Circuit open or delegation required → structured error content in `CallToolResult`/`ReadResourceResult` for REST; JSON‑RPC error with well‑known `code` and `data` fields otherwise.

---

## Protocol Handler Design

File: `src/server/protocol-handler.ts`

Responsibilities:
- Validate incoming requests and extract auth context (client bearer token) via a small helper.
- Integrate with `CapabilityAggregator` for capability discovery and name/URI mapping.
- Delegate actual backend communication to `RequestRouter`, which handles load balancing, retries, and circuit breakers.
- Normalize errors and, when applicable, surface OAuth delegation responses from `MultiAuthManager` (via the router’s auth hook).

Key methods and behavior:
- `handleListTools(req) → ListToolsResult`
  - Return `aggregator.getAllTools()` results directly; no auth required unless policy dictates.
- `handleCallTool(req) → CallToolResult`
  - Extract `clientToken` (if present) from request metadata/headers.
  - Let `RequestRouter.routeCallTool(req, clientToken)` perform mapping, auth, and forwarding.
  - If `OAuthDelegation` is required, the router currently returns an error‑shaped `content` object. Document this contract and keep behavior consistent.
- `handleListResources(req) → ListResourcesResult`
  - Return `aggregator.getAllResources()` results directly.
- `handleReadResource(req) → ReadResourceResult`
  - Extract `clientToken`; call `router.routeReadResource(req, clientToken)`.
- `handleSubscribe(req) → SubscribeResult`
  - Return `{ ok: true }` for now; future phases may wire real notifications.

Auth extraction and validation:
- For HTTP transports, extract `Authorization: Bearer <token>` from request headers (the server framework should pass this into the handler). For JSON‑RPC, carry auth in a well‑defined `meta` block alongside the request.
- If a token is present, `MultiAuthManager.validateClientToken` can be consulted for basic validation; actual per‑backend auth preparation happens inside the router via its `getAuthHeaders` provider.

Input validation:
- Verify required fields: `name` for `call_tool`, `uri` for `read_resource`.
- Enforce type checks on `arguments` if schemas are available (schemas are optional in `types/mcp.ts`).
- Consistently reject invalid requests with clear error messages and codes.

Threading and concurrency:
- The ProtocolHandler is stateless beyond its dependencies; it is safe to reuse a single instance.
- Avoid Node‑only APIs in handler logic; rely on `fetch`‑based router and pure TypeScript utilities.

---

## Master Server Integration

File: `src/server/master-server.ts`

The current implementation already wires a significant portion:
- Constructs `DefaultModuleLoader`, `CapabilityAggregator`, `RequestRouter` and a `ProtocolHandler` placeholder.
- Exposes `startFromConfig`, `loadServers`, `discoverAllCapabilities`, and `setAuthHeaderProvider` to integrate auth strategies.
- Provides health checks and unload/restart helpers.

To complete Phase 5:
- Inject all dependencies into `ProtocolHandler` so it can call into the router and aggregator consistently.
- Integrate `MultiAuthManager` by setting an auth header provider:
  - `masterServer.setAuthHeaderProvider((serverId, clientToken) => multiAuth.prepareAuthForBackend(serverId, clientToken))`
  - This enables delegate/proxy flows and pass‑through master auth.
- Initialization sequence:
  1. Load and validate configuration (`ConfigLoader`).
  2. Initialize `MultiAuthManager` with `master_oauth` config and register per‑server auth strategies from `servers[].auth_strategy` and `servers[].auth_config`.
  3. Load all servers via `DefaultModuleLoader.loadServers()`.
  4. Discover capabilities via `CapabilityAggregator.discoverCapabilities()`.
  5. Create `RequestRouter` with routing policy from `config.routing`.
  6. Create `ProtocolHandler` with injected aggregator, router, multi‑auth, and set up request handlers in the hosting layer (HTTP/JSON‑RPC adapter).
  7. Start background health monitoring (periodic `performHealthChecks`).
- Lifecycle hooks:
  - On configuration reloads, re‑run discovery and call `RequestRouter`’s internal `RouteRegistry.updateServers` (currently done via constructor on re‑instantiation; a light wrapper can propagate updates without rebuilds if desired).
  - On shutdown, call `unloadAll()` and ensure outstanding requests finish within a deadline.

Integration with hosting layer:
- Node (Express/Fastify): map HTTP endpoints to protocol methods (e.g., `/mcp/tools/list`, `/mcp/tools/call`, `/mcp/resources/list`, `/mcp/resources/read`, `/capabilities`, `/health`). Propagate `Authorization` header to the handler so the router can prepare backend auth.
- Workers: implement a `fetch()` handler that routes requests to the same handler methods; avoid Node‑specific APIs in server code paths.

---

## Configuration Management

Source: `src/config/config-loader.ts`, `src/types/config.ts`

Best practices:
- Centralize configuration load and validation at startup using the `ConfigLoader`. Use file‑based YAML as primary source, environment overrides for deployment variance.
- Validate required sections: `master_oauth`, `servers[]`, and `hosting`. The current loader already enforces a minimal schema.
- Distribute configuration:
  - `MultiAuthManager`: initialize with `master_oauth`; register `servers[].auth_strategy` and `servers[].auth_config`.
  - `ModuleLoader`: uses server `config` and `hosting` to derive endpoints.
  - `CapabilityAggregator`: use default endpoints (`/capabilities`, `/mcp/tools/list`, `/mcp/resources/list`) unless overridden.
  - `RequestRouter`: honor routing policy (`routing.loadBalancer`, `routing.circuitBreaker`, `routing.retry`).
- Secrets management:
  - Never bake secrets into the repo. Supply `TOKEN_ENC_KEY`, OAuth client secrets, and provider credentials via environment variables or secret stores.
- Hot reload (optional):
  - If runtime config reload is required, treat it as a phased update: pause new requests (or drain), reload servers, refresh discovery, swap router reference, resume.

---

## Lifecycle & Graceful Shutdown

Startup sequence (recommended):
1. Load config (file/env) and validate.
2. Initialize `MultiAuthManager` and register server auth strategies.
3. Load servers via `ModuleLoader` and run initial health checks.
4. Discover capabilities via `CapabilityAggregator` and index mappings.
5. Build `RequestRouter` with routing config; inject the `getAuthHeaders` provider from `MultiAuthManager`.
6. Instantiate `ProtocolHandler` and register transport routes (HTTP/JSON‑RPC).
7. Expose `/health` and `/capabilities` endpoints; begin background health checks at a fixed interval.

Shutdown sequence:
1. Stop accepting new requests (server‑level flag or server.close()).
2. Allow in‑flight requests to finish with a deadline; cancel remaining if needed.
3. Stop background health checks; flush logs/metrics.
4. `ModuleLoader.unloadAll()` to stop managed processes; release resources.

Health monitoring:
- Use `ModuleLoader.performHealthCheck()` to feed `RouteRegistry` health scores (indirectly via success/failure marking in the router). Consider a periodic sweeper to probe idle instances.

---

## Error Handling Strategy

Principles:
- Fail fast on invalid input with clear messages.
- Propagate auth/authorization failures distinctly from network errors.
- Normalize upstream failures (HTTP status, timeouts) into consistent error payloads and JSON‑RPC errors.
- Make circuit‑breaker state visible in errors where relevant (e.g., “circuit open, retryAfterMs”).

Recommended mappings:
- Validation errors → 400 / JSON‑RPC `-32602`.
- Not found (unknown server/tool/resource) → 404 / `-32601` (or domain‑specific code).
- Upstream/network/transient → 502/504 or `-32000` range with `data` including `lastStatus` and retry metadata.
- OAuth delegation required → return structured object indicating delegation with provider endpoints and scopes.

Logging:
- Use `Logger` consistently at INFO for high‑level events, WARN for recoverable issues, ERROR for failures, and DEBUG guarded by `DEBUG=1` for verbose traces. Avoid logging secrets.

---

## Performance Considerations

Hot paths:
- `RouteRegistry.resolve()`: cache recent resolutions (`cacheTtlMs`) to reduce selection overhead.
- `CapabilityAggregator`: keep mappings in memory; avoid re‑computing per request.
- Retry backoff (`RetryHandler`) with jitter reduces thundering herds.
- Circuit breaker short‑circuits calls to unhealthy instances.

Optimizations:
- Prefer JSON payloads and keep responses compact.
- Reduce capability discovery frequency; refresh on demand or at a reasonable interval.
- Consider compressing large resource reads if transport supports it.
- For high cardinality servers, shard health checks and discovery to avoid spikes.

Resource usage:
- Token storage: `TokenManager` encrypts and stores tokens; in production set `TOKEN_ENC_KEY`. Schedule `cleanupExpiredTokens()` to bound memory.

---

## Monitoring & Observability

Recommended signals:
- Request metrics per method: count, latency (p50/p95/p99), error rate.
- Routing metrics: retries, open circuits, half‑open transitions, selected LB strategy.
- Health metrics: per‑server instance health score, last health check timestamp, status.
- Auth metrics: delegation responses issued, proxy refreshes, validation failures (without PII).

Implementation hints:
- Wrap router calls to capture latency and outcome metrics.
- Surface `/health` (overall) and `/capabilities` for readiness probes.
- Include correlation IDs (request ID) in logs and forward them to backends when possible.

---

## Cross‑Platform Compatibility (Node & Workers)

Current constraints:
- Routing, aggregator, and auth manager avoid Node‑specific APIs and rely on `fetch`, making them compatible with Workers.
- `ConfigLoader` uses `node:fs/promises` (Node‑only). For Workers builds, either:
  - Use environment‑based config (`loadFromEnv`) exclusively, or
  - Provide a conditional import/export so the Node loader is tree‑shaken from Worker bundles.

Deployment notes:
- Node/Koyeb/Docker: run an HTTP server (Express/Fastify/undici) exposing MCP endpoints; retain the same handler logic.
- Workers: implement a `fetch()` entry that routes paths to `ProtocolHandler` methods; avoid dynamic `require` and other Node‑only code.
- Ensure all timeouts and retry budgets fit the platform limits (e.g., Workers CPU time constraints).

---

## Testing Strategy

Unit tests:
- `CapabilityAggregator` mappings and prefixing; discovery fallbacks when `/capabilities` fails.
- `RequestRouter` logic: mapping, retry/backoff behavior, circuit breaker transitions, load balancing choices.
- `MultiAuthManager`: token validation paths, delegation object shape, proxy refresh fallback logic.
- `TokenManager`: encryption/decryption, expiration cleanup, state generation/validation.

Integration tests:
- ProtocolHandler + Router + Aggregator using mocked `fetch` for backends.
- Auth integration paths: master pass‑through, delegation required (expect structured response), proxy refresh.
- Error paths: circuit open, upstream 5xx with retries, timeouts.

End‑to‑end (optional):
- Spin up a sample backend (or mock server) and drive calls through HTTP endpoints `/mcp/tools/call`, `/mcp/resources/read` with and without auth.

Cross‑platform tests:
- Run the same test suite under Node and a Workers‑like runtime (e.g., Miniflare) to ensure fetch‑based code paths behave consistently.

---

## Suggested Implementation Outline

ProtocolHandler (concrete wiring):
```ts
// src/server/protocol-handler.ts
export class ProtocolHandler {
  constructor(
    private readonly aggregator: CapabilityAggregator,
    private readonly router: RequestRouter,
    private readonly getAuthToken?: (req: unknown) => string | undefined
  ) {}

  private extractToken(req: any): string | undefined {
    // Prefer an injected extractor from the hosting layer; fallback to req.headers?.authorization
    try { return this.getAuthToken?.(req) ?? normalizeBearer(req?.headers?.authorization) } catch { return undefined }
  }

  async handleListTools(_req: ListToolsRequest): Promise<ListToolsResult> {
    return { tools: this.aggregator.getAllTools((this.router as any).servers) }
  }

  async handleCallTool(req: CallToolRequest & { meta?: any }): Promise<CallToolResult> {
    const token = this.extractToken(req)
    return this.router.routeCallTool(req, token)
  }

  async handleListResources(_req: ListResourcesRequest): Promise<ListResourcesResult> {
    return { resources: this.aggregator.getAllResources((this.router as any).servers) }
  }

  async handleReadResource(req: ReadResourceRequest & { meta?: any }): Promise<ReadResourceResult> {
    const token = this.extractToken(req)
    return this.router.routeReadResource(req, token)
  }

  async handleSubscribe(_req: SubscribeRequest): Promise<SubscribeResult> {
    return this.router.routeSubscribe(_req)
  }
}
```

MasterServer (initialization and DI):
```ts
// src/server/master-server.ts
export class MasterServer {
  constructor(/* ... */) {
    // create loader, aggregator
    // create router with getAuthHeaders provider (wired to MultiAuthManager)
    // construct ProtocolHandler with dependencies
  }

  async startFromConfig(config: MasterConfig, clientToken?: string): Promise<void> {
    // 1) load servers -> 2) discover capabilities -> 3) wire handler
  }
}
```

Hosting adapter (Node/Workers):
```ts
// Pseudocode for HTTP wiring
app.post('/mcp/tools/list', (req, res) => handler.handleListTools(req.body).then(res.json))
app.post('/mcp/tools/call', (req, res) => handler.handleCallTool({ ...req.body, meta: { headers: req.headers } }).then(res.json))
app.post('/mcp/resources/list', (req, res) => handler.handleListResources(req.body).then(res.json))
app.post('/mcp/resources/read', (req, res) => handler.handleReadResource({ ...req.body, meta: { headers: req.headers } }).then(res.json))
app.get('/capabilities', (_req, res) => res.json(aggregator.aggregate([...servers])))
app.get('/health', async (_req, res) => res.json({ ok: true, servers: await ms.performHealthChecks() }))
```

Notes:
- Keep ProtocolHandler thin; routing and auth composition stay in `RequestRouter` and `MultiAuthManager`.
- Avoid Node‑only APIs in the handler/routing paths to preserve Workers compatibility.

---

## Conclusion

Phase 5 finalizes the core server by implementing a complete protocol handler and orchestrating all components into a coherent whole. With clear initialization, strong error/observability practices, and cross‑platform design, the Master MCP Server becomes a production‑ready aggregation layer exposing a single, consistent MCP interface across heterogeneous backends.

