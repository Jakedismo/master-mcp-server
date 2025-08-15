# Master MCP Server — Phase 1 Architecture

This document defines the architectural foundation for Phase 1: Project Setup and Core Structure of the Master MCP Server. It consolidates the requirements from master-mcp-definition.md and incorporates the researcher agent’s recommendations from docs/research/phase1-analysis.md.

Goals
- Establish a clear, scalable directory structure with stable module boundaries
- Define dependency relationships between modules and layers
- Specify TypeScript configuration for Node and Cloudflare Workers
- Architect core types and interfaces to unblock future phases
- Describe the build toolchain and day-to-day dev workflow
- Capture cross-platform deployment considerations (Cloudflare Workers, Koyeb, Docker)


## Project Structure

The repository follows a domain-first layout with runtime adapters. Pure logic and types live under src/, with small entrypoints per runtime.

```
master-mcp-server/
├── src/
│   ├── index.ts                          # (Planned) core server bootstrap factory
│   ├── server/
│   │   ├── master-server.ts              # (Planned) master server orchestration
│   │   └── protocol-handler.ts           # Protocol handler (interfaces/stubs in Phase 1)
│   ├── modules/
│   │   ├── module-loader.ts              # (Interfaces in Phase 1) dynamic server loading
│   │   ├── capability-aggregator.ts      # (Interfaces in Phase 1) aggregate tools/resources
│   │   └── request-router.ts             # (Interfaces in Phase 1) route MCP calls to backends
│   ├── auth/
│   │   ├── multi-auth-manager.ts         # Stubs in Phase 1; full impl in Phase 2
│   │   ├── oauth-providers.ts            # Provider interfaces + placeholders
│   │   └── token-manager.ts              # In-memory token store + crypto helpers
│   ├── config/
│   │   └── config-loader.ts              # YAML/JSON config loader + validation hook
│   ├── types/
│   │   ├── config.ts                     # MasterConfig, ServerConfig, AuthStrategy, etc.
│   │   ├── auth.ts                       # OAuth token/delegation types
│   │   └── server.ts                     # LoadedServer, ServerCapabilities
│   ├── utils/
│   │   ├── logger.ts                     # pino-style logging adapter (extensible)
│   │   ├── crypto.ts                     # symmetric encrypt/decrypt wrappers
│   │   └── validators.ts                 # schema validators (zod-ready)
│   └── runtime/
│       ├── node.ts                       # (Planned) Node adapter (Express/Hono)
│       └── worker.ts                     # (Planned) Cloudflare Workers adapter
├── tests/                                 # Unit and integration tests (Phase 1 focus: types)
├── deploy/
│   ├── cloudflare/                        # wrangler.toml and worker build stubs (later)
│   ├── docker/                            # Dockerfile and compose examples
│   └── koyeb/                             # Procfile/service manifest examples
├── examples/
│   └── sample-configs/                    # Example MasterConfig files
├── docs/
│   ├── architecture/                      # This document
│   └── research/                          # phase1-analysis and future findings
├── tsconfig.base.json
├── tsconfig.node.json
├── tsconfig.worker.json
└── tsconfig.json
```

Rationale
- Runtime adapters: Isolate Node vs Workers specifics (transports, HTTP servers, crypto, storage). Core remains runtime-agnostic.
- Stable domains: server/, modules/, auth/, config/, utils/, types/ encourage clear ownership and testing.
- Extensibility: module-loader and capability-aggregator are defined as interfaces now, implemented in Phase 3.
- Testability: pure TypeScript modules with typed interfaces and inversion-of-control patterns ease mocking.


## Module Organization and Dependencies

Layers (outer depends on inner; inner never imports outer):

- types: pure types and enums only
- utils: helpers with no business logic (crypto, logger, validation)
- config: config loading/validation, depends on types and utils
- auth: tokens and provider interfaces, depends on types/utils/config
- modules: loader, capability aggregation, routing; depends on types/utils/config/auth
- server: orchestration and protocol handlers; depends on types/utils/config/auth/modules
- runtime: thin adapters (Node/Worker) wiring transports; depends on server (never the reverse)

ASCII dependency diagram
```
runtime (node|worker)
        │
        ▼
     server ──► modules ──► auth ──► config ──► utils ──► types
        │                     │                     ▲
        │                     └────────────► types ─┘
        └──────────────────────────────► types
```

Module boundaries
- server/protocol-handler.ts: owns MCP method bindings (list_tools, call_tool, list_resources, read_resource, subscribe). No runtime or network primitives inside; only uses module and auth interfaces.
- modules/capability-aggregator.ts: composes backend capabilities; exposes aggregate view to server.
- modules/module-loader.ts: resolves/launches MCP backend servers (types only now). Later supports git/npm/docker/local or remote endpoints.
- modules/request-router.ts: routes MCP requests to the correct backend instance based on server id and capability mapping.
- auth/multi-auth-manager.ts: prepares auth headers or delegation flows based on strategy (master_oauth, delegate_oauth, bypass_auth, proxy_oauth).
- auth/oauth-providers.ts: per-provider token validation and userinfo fetch via provider-specific APIs.
- auth/token-manager.ts: token encryption, storage abstraction; Phase 1 uses in-memory; later: KV/Redis/DOs.
- config/config-loader.ts: loads and validates MasterConfig from YAML/JSON; supplies defaults.
- utils/*: no imports from business modules; safe to use anywhere.

Key rules
- One-way dependencies; avoid cycles by depending only inward.
- No Node-only APIs in core (server/modules/auth/config/types/utils). Keep Node APIs in runtime/node.ts.
- Protocol handler must not know about Express/Workers; it consumes pure interfaces.


## TypeScript Configuration Architecture

We use a base config plus per-runtime overlays, matching phase1-analysis recommendations and current files.

- tsconfig.base.json
  - target: ES2022, module: ESNext, moduleResolution: NodeNext
  - strict TS flags enabled; declaration + sourceMap on
  - include: src/**; exclude: node_modules, dist, tests

- tsconfig.node.json
  - extends base; outDir: dist/node
  - module/moduleResolution: NodeNext; lib: [ES2022]; types: [node]
  - purpose: Node builds (Koyeb/Docker, local dev, CLI)

- tsconfig.worker.json
  - extends base; outDir: dist/worker
  - module: ESNext; moduleResolution: Bundler; lib: [ES2022, WebWorker, DOM]
  - purpose: Cloudflare Workers build

- tsconfig.json
  - extends tsconfig.node.json for default tooling compatibility

Notes and options
- ESM-only: package.json uses "type": "module"; prefer ESM across builds.
- Path aliases (optional for later): add compilerOptions.paths to group domains (e.g., @core/*). Not required now to avoid churn.
- SDK types: depend on @modelcontextprotocol/sdk types for request/response payloads when implementing handlers.
- Cross-runtime crypto/JWT: consider using jose in later phases for Workers compatibility; current deps include jsonwebtoken which is Node-only.


## Core Type System and Interfaces Hierarchy

The types in src/types form the public contract across modules and over time. Phase 1 emphasizes stable shapes and minimal commitments.

Primary types (current files)
- MasterConfig: top-level configuration
- ServerConfig: describes a single backend server and how to auth
- AuthStrategy: enum of strategies (master_oauth, delegate_oauth, bypass_auth, proxy_oauth)
- MasterAuthConfig (aka MasterOAuthConfig): OIDC/OAuth client config for master server
- OAuthDelegationConfig: controls delegation behavior
- HostingConfig: deployment metadata (platform, ports, base URL)
- OAuthDelegation, OAuthToken, AuthHeaders, ClientInfo: auth-centric types
- LoadedServer: runtime representation of a backend instance
- ServerCapabilities: tools/resources/prompts aggregated from backends

Conceptual relationships
```
MasterConfig
 ├─ master_oauth: MasterAuthConfig
 ├─ servers: ServerConfig[]
 │    └─ auth_strategy: AuthStrategy
 │       └─ auth_config?: ServerAuthConfig
 ├─ oauth_delegation?: OAuthDelegationConfig
 └─ hosting: HostingConfig

LoadedServer
 ├─ config: ServerConfig
 ├─ endpoint: string
 └─ capabilities?: ServerCapabilities

MultiAuthManager (class)
 ├─ prepareAuthForBackend(): AuthHeaders | OAuthDelegation
 └─ validateClientToken(): Promise<boolean>

ProtocolHandler (class)
 ├─ handleListTools, handleCallTool, handleListResources, handleReadResource, handleSubscribe
 └─ Depends on CapabilityAggregator + RequestRouter + MultiAuthManager
```

Hierarchy/extension guidance
- Keep OAuth provider specifics behind interfaces (OAuthProvider). ServerAuthConfig carries provider config; provider impls map to concrete flows.
- Token storage behind TokenManager; switchable backends in later phases (in-memory, KV, Redis, Durable Objects).
- Capability aggregation returns a normalized ServerCapabilities shape for MCP exposure.


## Build Toolchain and Development Workflow

Current scripts (package.json)
- clean: rimraf dist .turbo tsconfig.tsbuildinfo
- typecheck: tsc -p tsconfig.node.json --noEmit
- build: npm run build:node && npm run build:worker
- build:node: tsc -p tsconfig.node.json
- build:worker: tsc -p tsconfig.worker.json
- dev: ts-node --project tsconfig.node.json src/index.ts
- lint: eslint . --ext .ts,.tsx
- format: prettier --write .

Recommendations (Phase 1)
- Keep tsc builds per-runtime as defined (fast and simple).
- Consider adding tsup/esbuild in later phases for single-file Worker bundles (optional now).
- Maintain separate dist outputs (dist/node, dist/worker) to avoid cross-runtime artifacts.
- Prefer global fetch (Node >=18) to ease Worker compatibility; avoid node-fetch in new code.
- Prefer jose over jsonwebtoken when auth is implemented (Phase 2) for Workers support.

Development flow
- Write runtime-agnostic logic in core modules, then wire in runtime adapters.
- Use strict types; keep interfaces stable; add docs to public types.
- Run lint/format/typecheck in CI and pre-commit hooks (husky installed).

Testing strategy
- Unit test pure modules (types/utils/config/auth stubs) with mocks.
- Integration tests later for protocol-handler with a fake module loader and in-memory token manager.
- Avoid hitting real OAuth providers in tests; mock OAuthProvider and HTTP calls.


## Cross-Platform Deployment Considerations

Cloudflare Workers
- ESM only; no Node built-ins like fs/net/crypto randomBytes; use Web Crypto and fetch.
- Build with tsconfig.worker.json; output to dist/worker; add wrangler.toml under deploy/cloudflare/.
- Store tokens in Workers KV/DOs (later); TokenManager to provide a Workers implementation.
- Logging via console or platform-specific sinks.

Koyeb (Node container)
- Use dist/node build; run a small HTTP server (Express/Hono) in runtime/node.ts.
- Env via process.env; secrets mounted via platform.
- Token storage can be ephemeral (dev) or external (Redis/Postgres) in later phases.

Docker
- Multi-stage Dockerfile: build (tsc) then runtime image with node:20-alpine.
- Provide examples under deploy/docker/ including healthcheck and minimal CMD.
- Mount config via bind or COPY; avoid secrets in images.

Common concerns
- Observability: JSON logs (pino-style) with request IDs; health endpoint for Node runtime.
- Configuration: prefer YAML/JSON with schema validation (zod) to catch misconfigs early.
- Security: never log tokens; encrypt at rest; rotate keys; rate-limit auth endpoints.


## Scalability, Testability, and Maintainability

Scalability
- Module loader designed for heterogeneous backends (git/npm/docker/local/remote). Add workers/child-process orchestration later.
- Capability aggregator composes many backends; design for lazy discovery and per-server caching.
- Auth strategies encapsulated; easy to add new providers by extending OAuthProvider.

Testability
- Inversion of control: inject TokenManager, OAuthProvider, and HTTP client into classes.
- Keep side effects in runtime adapters; core remains pure and deterministically testable.
- Provide thin interfaces per boundary (e.g., CapabilityAggregator) and test against them.

Maintainability
- One-way dependencies reduce coupling and cycles.
- Strict TS settings and clear types surface API changes quickly.
- Small, focused modules with explicit public APIs ease refactors.


## Phase 1 Deliverables Checklist

- Directory structure and module boundaries defined (this doc)
- Dependency diagram and layering rules established
- TypeScript config architecture documented (base + node + worker)
- Core types and interface hierarchy articulated
- Build toolchain and dev workflow described
- Cross-platform considerations captured for Workers, Koyeb, Docker


## Appendix: Future Phase Hooks (Non-binding)

- Authentication (Phase 2): implement MultiAuthManager with jose, token refresh, and provider integrations.
- Module Loading (Phase 3): implement ModuleLoader with process management or remote adapters.
- Protocol Wiring (Phase 4): bind MCP handlers to transports (stdio/ws/http) in runtime adapters.
- Persistence (Phase 7+): TokenManager backends (KV/Redis/DOs), audit logging, metrics.

