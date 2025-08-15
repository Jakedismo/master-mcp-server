# Phase 9 — Comprehensive Testing Architecture

This document specifies the end-to-end testing architecture for the Master MCP Server across Node.js and Cloudflare Workers. It is tailored to this codebase (TypeScript, ESM, strict mode) and builds on Phases 1–8 (auth, module loading, routing, config, OAuth, utils).

## Goals
- Cross-platform: Node 18+ and Cloudflare Workers.
- ESM + TypeScript strict compatibility.
- Leverage existing utilities (logging, validation, monitoring).
- Clear test layering: unit, integration, E2E, plus security and performance.
- Deterministic, isolated, and parallel-friendly test runs.
- CI/CD automation with quality gates and coverage thresholds.

---

## Framework Selection

- Unit/Integration (Node): Vitest
  - Fast, ESM-native, TS-friendly. Built-in mock timers and coverage via V8.
  - Supertest for Express-based HTTP integration of Node runtime (`src/index.ts`).
  - Undici MockAgent (optional) for fetch interception on Node 18, when not spinning stub servers.

- Unit/Integration (Workers): Vitest + Miniflare 3
  - `miniflare` test environment for `Request`/`Response` compatibility.
  - Target `OAuthFlowController.handleRequest` and any worker entrypoints (`src/runtime/worker.ts`).

- E2E (HTTP-level): Vitest test suite using real HTTP listeners
  - Node: start Express via `createServer(true)` and use Supertest/HTTP.
  - Workers: run Miniflare instance or `wrangler dev` in CI as needed.

- Performance: Artillery
  - Simple YAML scenarios to stress authentication and routing endpoints.
  - Separate CI job; can be run locally against dev servers.

- Security: Vitest + fast-check (property-based) + static assertions
  - Fuzz inputs for token parsing, state/PKCE validation, and router input validation.
  - Optional OWASP ZAP baseline in CI (nightly) if desired.

---

## Directory Structure

```
tests/
  unit/
    routing/              # circuit-breaker, retry, load-balancer
    modules/              # aggregator, router (with fetch mocked)
    oauth/                # pkce/state/validator
    utils/                # logger, validation helpers
  integration/
    node/                 # express endpoints, config manager wiring
    workers/              # flow-controller.handleRequest via Miniflare
    oauth/                # callback flow with mock OIDC provider
  e2e/
    node/                 # start full HTTP server and hit /mcp/*, /oauth/*
    workers/              # worker entrypoint end-to-end
  mocks/
    oauth/                # mock OIDC provider (Node + Worker variants)
    mcp/                  # fake MCP backends (capabilities/tools/resources)
    http/                 # undici MockAgent helpers (Node)
  factories/
    configFactory.ts      # MasterConfig, ServerConfig builders
    oauthFactory.ts       # tokens/states/JWKS
    mcpFactory.ts         # tool/resource definitions
  fixtures/
    capabilities.json
    tools.json
    resources.json
  perf/
    artillery/
      auth-routing.yaml   # load scenarios for auth + routing
  security/
    oauth.spec.ts         # PKCE/state/nonce fuzz tests (fast-check)
  _setup/
    vitest.setup.ts       # global hooks, silent logs, fake timers config
    miniflare.setup.ts    # worker env config for tests
  _utils/
    test-server.ts        # ephemeral HTTP servers
    mock-fetch.ts         # Node fetch interception (Undici)
    log-capture.ts        # capture + assert logs
```

Notes:
- The unit layer uses pure module-level tests with fetch mocked or local HTTP stubs.
- Integration tests are black-box at module boundaries (e.g., ProtocolHandler + RequestRouter + mocks).
- E2E spins the real Node server and/or Miniflare worker with realistic mocks for upstream MCP servers and OIDC.

---

## Test Environment Management

- Node vs Workers selection
  - Node-specific Vitest config: `vitest.config.ts` (environment: node)
  - Workers-specific Vitest config: `vitest.worker.config.ts` (environment: miniflare)
  - Test files can explicitly opt into Miniflare with `// @vitest-environment miniflare`.

- Isolation and determinism
  - Use Vitest’s fake timers for retry/circuit tests.
  - Ephemeral HTTP servers: `tests/_utils/test-server.ts` binds to port 0 and auto-closes in `afterEach`.
  - Log capture: disable or capture logs via `Logger.configure({ json: true })` for stable assertions.

- Cross-platform resources
  - OAuth flows invoke real HTTP endpoints; a mock OIDC provider runs as an in-process HTTP server in both Node and Miniflare scenarios (Miniflare tests remain in a Node host context, so spinning a Node HTTP stub is acceptable).
  - Upstream MCP backends emulated by `fake-backend` servers exposing `/capabilities`, `/mcp/tools/*`, `/mcp/resources/*`.

---

## Mock and Stub Architecture

### MCP Protocol Backends
- Fake backend servers respond with deterministic JSON:
  - `GET /capabilities`: lists tools/resources/prompts
  - `POST /mcp/tools/list` and `/mcp/resources/list`: optional fallbacks
  - `POST /mcp/tools/call`: echoes arguments or returns canned results
  - `POST /mcp/resources/read`: returns fixture content
- Supports Bearer tokens to simulate auth propagation from Master.

### OAuth Provider (OIDC) Mock
- Node HTTP server (Express or http module) serving:
  - `/.well-known/openid-configuration`
  - `/authorize`: simulates auth code issuance by redirecting with `code` + `state`
  - `/token`: returns JSON access token, optional refresh, scopes, `expires_in`
  - `/jwks.json`: JWKS for completeness if JOSE validation is later added upstream
- Uses `jose` to generate ephemeral key material and produce signed tokens if needed.
- Configurable via factory helpers to tailor provider metadata per test.

### HTTP Mocking for Node (optional)
- `undici` MockAgent helper when spinning HTTP servers is overkill.
- Route by URL patterns and methods; fallback to network disallowed.

---

## Test Data Management

- Fixtures: JSON payloads for tools/resources/capabilities. Keep small and readable.
- Factories:
  - `configFactory`: produce `MasterConfig` + `ServerConfig` with sensible defaults (ports, endpoints, auth strategies).
  - `oauthFactory`: generate PKCE/state payloads and basic OAuth token shapes.
  - `mcpFactory`: create tool/resource definitions and common requests.
- State/Token Stores:
  - In-memory only; reset across tests.
  - If a persistent DB is introduced later:
    - Node: use SQLite in-memory or Testcontainers in CI; provide cleanup hooks.
    - Workers: use Miniflare KV/D1 bindings with per-test namespaces.

---

## Performance Testing Strategy (Artillery)

- Scenarios:
  - OAuth authorize/token (mock provider) happy-path latency and error rates.
  - Routing: `POST /mcp/tools/call` with mixed success/failure from backends to exercise retry/circuit logic.
  - Server lifecycle: parallel discovery calls to `/capabilities` against multiple backends.
- Metrics:
  - p50/p90/p99 latency, RPS, error rates per route.
  - Custom logs via `Logger.time` around critical paths; scrape from structured logs when running locally.
- CI:
  - Run on a separate “performance” workflow or on nightly schedules to avoid slowing PRs.

---

## Security Testing Architecture

- Property-based testing with `fast-check` for:
  - `FlowValidator.validateReturnTo`: ensure only safe origins/paths pass.
  - `StateManager` and `PKCEManager`: state integrity, one-time consumption, and PKCE verifier binding.
  - Input validation for router requests (e.g., tool/resource names) using `utils/validation` helpers.
- OAuth flow protections:
  - Ensure `state` is required and consumed exactly once.
  - Enforce PKCE method presence, verify rejection on mismatch.
  - Token exchange failure handling and error surface is sanitized.
- Optional dynamic scans:
  - OWASP ZAP baseline against local server in CI (nightly) to catch obvious misconfigurations.

---

## CI/CD Integration

### Jobs
- Lint + Typecheck: ESLint and `tsc -p tsconfig.node.json --noEmit`.
- Unit + Integration (Node): Vitest with coverage.
- Unit + Integration (Workers): Vitest (Miniflare) with coverage.
- E2E: start local server; run black-box tests.
- Security: property tests; optional ZAP baseline (nightly).
- Performance: Artillery (nightly or gated by label).

### Coverage and Quality Gates
- Coverage via Vitest v8 provider; thresholds:
  - Global: `branches: 80%`, `functions: 85%`, `lines: 85%`, `statements: 85%`.
  - Critical modules (routing, oauth): per-file `lines: 90%` target in follow-up.
- Fail PR job if thresholds not met.
- Upload `lcov` or `cobertura` to CI artifacts (or Codecov if desired).

---

## Test Utilities Integration (Phase 8)

- Logger: `Logger.configure({ json: true, level: 'error' })` in test setup; use `log-capture` to assert important events.
- Validation: assert guards (`assertString`, `sanitizeObject`) across boundary tests; fuzz via fast-check.
- Monitoring: wrap performance-critical test paths with `Logger.time` and assert upper bounds during perf runs.

---

## Local and CI Usage

- Local:
  - `vitest -c vitest.config.ts` for Node suites.
  - `vitest -c vitest.worker.config.ts` for Worker suites.
  - `artillery run tests/perf/artillery/auth-routing.yaml` for load tests.

- CI:
  - Run jobs in parallel; collect coverage and artifacts.
  - Gate merges on lint, typecheck, unit/integration, and coverage.

---

## Next Steps (Implementation Guide)
1. Install dev deps: vitest, @vitest/coverage-v8, supertest, miniflare, artillery, fast-check, @types/supertest.
2. Add scripts: `test`, `test:node`, `test:workers`, `test:coverage`, `test:e2e`.
3. Fill factories and mocks with minimal working endpoints.
4. Seed initial critical tests:
   - routing: circuit-breaker/retry/load-balancer
   - oauth: state, pkce, callback error handling
   - aggregator: discovery + mapping
   - protocol: call tool/resource happy path and error path

