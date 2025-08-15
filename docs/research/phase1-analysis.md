# Master MCP Server — Phase 1 Analysis (Project Setup and Core Structure)

This document analyzes Phase 1 requirements from `master-mcp-definition.md`, provides MCP SDK integration guidance, TypeScript setup best practices, early multi-auth/OAuth design considerations, dependency recommendations, and risks specific to the Phase 1 scope. Deployment target nuances (Cloudflare Workers, Koyeb, Docker) are called out where they affect setup decisions.


## Phase 1 Scope Extract (from master-mcp-definition.md)

- Project goal: A Master MCP Server aggregating multiple MCP servers behind a single endpoint with flexible auth strategies.
- Tech stack: TypeScript/Node.js with MCP SDK. Targets: Cloudflare Workers, Koyeb, Docker.
- Phase 1 tasks:
  - Initialize project structure (directories, entry points, scaffolds).
  - Install base dependencies and TypeScript tooling.
  - Define core types and interfaces under `src/types`:
    - `config.ts`: `MasterConfig`, `ServerConfig`, `AuthStrategy`, etc.
    - `auth.ts`: `AuthHeaders`, `OAuthDelegation`, `OAuthToken`, etc.
    - `server.ts`: `LoadedServer`, `ServerCapabilities`, etc.
- Non-goals in Phase 1 (prepare but do not implement):
  - Multi-auth logic internals, OAuth providers, token storage.
  - Module loading, capability aggregation, request routing, protocol handler.
  - Runtime behaviors (health checks, restarts, end-to-end OAuth flows).

Implication: Phase 1 focuses on a clean, future-proof structure, environment/tooling, and accurate type contracts to unblock Phases 2–5 without rework.


## Recommended Project Structure (Phase 1)

```
master-mcp-server/
├── src/
│   ├── index.ts                  # Entry (stdio/WS bootstrap behind feature flags)
│   ├── server/
│   │   ├── master-server.ts      # Class stub + constructor wiring (no logic yet)
│   │   └── protocol-handler.ts   # Method signatures only
│   ├── auth/
│   │   ├── multi-auth-manager.ts # Stub with method signatures
│   │   ├── oauth-providers.ts    # Interfaces + stubs
│   │   └── token-manager.ts      # Interfaces + stubs
│   ├── modules/
│   │   ├── module-loader.ts      # Interfaces + stubs
│   │   ├── capability-aggregator.ts
│   │   └── request-router.ts
│   ├── types/
│   │   ├── config.ts             # Phase 1: define types
│   │   ├── auth.ts               # Phase 1: define types
│   │   └── server.ts             # Phase 1: define types
│   ├── utils/
│   │   ├── logger.ts             # Stub with no-op logging in Phase 1
│   │   ├── crypto.ts             # Stub with unimplemented methods
│   │   └── validators.ts         # Basic runtime checks for config
│   └── config/
│       └── config-loader.ts      # Signatures + minimal env-based loader
├── tests/                        # Placeholder; no full tests in Phase 1
├── deploy/
│   ├── cloudflare/               # wrangler.toml + worker entry stub in later phase
│   ├── docker/                   # Dockerfile in later phase
│   └── koyeb/                    # Procfile/manifest in later phase
├── examples/
│   └── sample-configs/           # Minimal example YAML later
├── package.json
├── tsconfig.json
└── README.md
```

Notes:
- Keep all code ESM-first to support Workers and modern Node.
- Separate transport/bootstrap concerns (stdio/WS/SSE/Workers) from core classes so deployments swap adapters without touching business logic.


## MCP SDK Integration Recommendations

- SDK: `@modelcontextprotocol/sdk` (ESM). Design around transports:
  - Local/dev: `StdioServerTransport` for easy testing with MCP clients.
  - Remote: WebSocket or SSE transports for HTTP-based runtime (Koyeb/Docker). Workers require HTTP/WebSocket/SSE; no stdio and no child processes.
- Server composition pattern:
  - Create a `MasterMcpServer` with injected dependencies (module loader, auth manager, request router, capability aggregator, protocol handler). In Phase 1, wire classes and method signatures only.
  - Expose a function to “mount” server on a transport; keep transport-specific code in `src/index.ts` (Node) and a separate Workers entry (later phase) to avoid platform conditionals in core.

Example bootstrap (Node stdio) for Phase 1 scaffolding:

```ts
// src/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { MasterMcpServer } from "./server/master-server.js";
import type { MasterConfig } from "./types/config.js";

const config: MasterConfig = {
  // Minimal placeholder that validates Phase 1 types
  master_oauth: undefined as any,
  servers: [],
  hosting: { platform: "node" } as any,
};

async function main() {
  const underlying = new McpServer({ name: "master-mcp", version: "0.1.0" });
  const master = new MasterMcpServer(config, underlying);
  // master.initialize() comes in later phases

  const transport = new StdioServerTransport();
  underlying.connect(transport);
}

main().catch((err) => {
  console.error("Fatal startup error", err);
  process.exit(1);
});
```

Key practices:
- ESM-only imports (`.js` extensions in TS path output) to keep compatibility with Workers bundlers.
- Do not leak Node-only APIs into core classes; isolate them in adapters.
- Define strict request/response types aligned with MCP schema; validate at boundaries.


## TypeScript Setup Best Practices

- Compiler settings:
  - `target`: `ES2022` or higher; `module`: `ESNext`; `moduleResolution`: `bundler` or `nodenext`.
  - `strict`: `true`; `noUncheckedIndexedAccess`: `true`; `exactOptionalPropertyTypes`: `true`.
  - `declaration`: `true` if publishing; otherwise optional.
  - `outDir`: `dist`; `rootDir`: `src`.
  - Path aliases for folders you own; avoid aliasing external packages.
- Package type: set `"type": "module"` in `package.json` for ESM.
- Linting/formatting: ESLint with TypeScript plugin + Prettier.
- Bundling: `tsup` or `esbuild` for Node/Koyeb/Docker images. For Workers, rely on `wrangler` bundler.
- Testing: `vitest` (fast, ESM-friendly), with `tsconfig.spec.json` extending the base.

Minimal tsconfig suggestion (Phase 1):

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "types": []
  },
  "include": ["src"]
}
```

Minimal package.json fields:

```json
{
  "name": "master-mcp-server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsup src/index.ts --format esm --out-dir dist --dts",
    "dev": "tsx src/index.ts",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest"
  },
  "devDependencies": {
    "@types/node": "^20",
    "eslint": "^9",
    "eslint-config-prettier": "^9",
    "eslint-plugin-import": "^2",
    "prettier": "^3",
    "tsup": "^8",
    "tsx": "^4",
    "typescript": "^5",
    "vitest": "^2"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^0" 
  }
}
```

Notes:
- `@modelcontextprotocol/sdk` version pinned to the latest major 0.x; exact pin to be decided when initializing the repo to match client expectations.
- Prefer native `fetch` on Node 18+ instead of `node-fetch`. Workers already provide `fetch`.


## Multi-Auth and OAuth Considerations (Phase 1 Design)

Phase 1 defines types and high-level contracts; implementation comes in Phase 2. Decisions now affect portability and security:

- Token handling library: prefer `jose` for JWT verification/signing across Node and Workers. Avoid Node-only modules (`jsonwebtoken`) to keep Workers compatibility.
- OAuth client implementation: prefer the standards-based `oauth4webapi` (runs in browsers/Workers/Node) over `openid-client` for portability. Use it in later phases to implement PKCE and OIDC discovery.
- Storage abstraction: define a simple token storage interface now so Workers (KV/Durable Objects), Docker/Koyeb (filesystem/Redis/Postgres) can plug in later. In Phase 1, only define the interfaces.
- Strategies alignment with spec (`AuthStrategy`):
  - `MASTER_OAUTH`: validate client JWT with master issuer; inject as bearer to backends that accept it.
  - `DELEGATE_OAUTH`: server-specific OAuth via redirect; store per-client per-server token mapping.
  - `PROXY_OAUTH`: exchange or forward client token to backend (introspect, map scopes).
  - `BYPASS_AUTH`: no auth added by master for that backend.
- Security primitives to encode in types:
  - State/nonce (base64url) and PKCE (`code_verifier`/`code_challenge`).
  - `expires_at` numeric epoch milliseconds; clock skew handling added later.
  - Strong key management and at-rest encryption for tokens (handled later by `CryptoUtils`).

Type hints to ground Phase 1:

```ts
// src/types/auth.ts additions to ensure portability
export interface OAuthState {
  value: string;        // base64url encoded
  issuedAt: number;     // epoch ms
  audience?: string;    // optional routing context
}

export interface ClientInfo {
  clientId: string;
  redirectUri: string;
}
```


## Dependency Analysis and Recommendations

Cross-platform constraints and suggested choices for Phase 1 (scaffolding):

- MCP SDK:
  - Use `@modelcontextprotocol/sdk` (ESM). Avoid Node-only transports in core code. Keep transport-specific code in adapters.
- HTTP/Router:
  - For Node/Koyeb/Docker: you can use a lightweight router if needed later (e.g., `hono`, `elysia`, or `express`). However, Express does not run on Workers; prefer `hono` for cross-platform HTTP endpoints (OAuth callbacks) in later phases. Phase 1 can skip installing any HTTP framework.
- Fetch:
  - Use global `fetch` (Node 18+ and Workers). Avoid `node-fetch` dependency.
- JWT/OIDC:
  - Prefer `jose` and `oauth4webapi` for portability. Avoid `jsonwebtoken`.
- YAML/config:
  - Use `yaml` or `js-yaml` for YAML. Workers can’t `fs.readFile` in runtime; plan for env-based config on Workers.
- Logging:
  - Use a minimal in-house logger in Phase 1; consider `pino` later for Node-only deployments if needed.

Suggested initial dependency set for Phase 1 (keep lean):
- dependencies: `@modelcontextprotocol/sdk`
- devDependencies: `typescript`, `tsup`, `tsx`, `eslint`, `prettier`, `vitest`, `@types/node`

Platform versions:
- Node: 18.18+ (native fetch, WHATWG URL) or 20.x LTS preferred.
- Cloudflare Workers: latest; develop using `wrangler` 3.x in a later phase.


## Deployment Target Considerations (Affecting Setup)

- Cloudflare Workers:
  - No `child_process`, no filesystem writes, no TCP sockets; can’t spawn backend MCP servers. Master must operate as a pure HTTP/WebSocket/SSE router in Workers deployments. Design core to support a “remote-only” server mode.
  - ESM required; use durable storage (KV, DOs, D1) for tokens in later phases.
- Koyeb (Node runtime) and Docker:
  - Full Node APIs available; module loader can spawn child processes for local MCP servers in later phases.
  - Ship ESM bundle. Expose HTTP port for WebSocket/SSE based MCP transport and OAuth callbacks.

Design decision for Phase 1: Ensure the `ModuleLoader` and `TokenManager` are interfaces with pluggable implementations so Workers builds can exclude Node-only behavior.


## Example Interfaces/Scaffolds for Phase 1

Master server constructor pattern:

```ts
// src/server/master-server.ts (Phase 1 skeleton)
import type { MasterConfig } from "../types/config.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export class MasterMcpServer {
  constructor(private config: MasterConfig, private mcp: McpServer) {}

  // Phase 1: only declare methods
  async initialize(): Promise<void> {}
  private setupRequestHandlers(): void {}
  async shutdown(): Promise<void> {}
}
```

Validators to keep contracts honest:

```ts
// src/utils/validators.ts (Phase 1 minimal)
import type { MasterConfig } from "../types/config.js";

export function assertValidMasterConfig(cfg: MasterConfig): void {
  if (!cfg) throw new Error("MasterConfig required");
  if (!Array.isArray(cfg.servers)) throw new Error("servers must be array");
}
```


## Risk Assessment (Phase 1)

- ESM/CJS incompatibility: Using ESM-only is necessary for Workers. Some Node libraries (e.g., `jsonwebtoken`, `express` middlewares) may expect CJS; avoid them.
- Transport fragmentation: stdio vs WS/SSE require different bootstraps. Mitigate by isolating transports and keeping the core server transport-agnostic.
- Multi-platform constraints: Workers cannot spawn processes or read local files. Design module loading and config loading as interfaces with platform-specific implementations later.
- Dependency bloat: Installing Node-only HTTP frameworks or `node-fetch` in Phase 1 risks future refactors. Keep dependencies minimal and portable.
- OAuth complexity: Picking incompatible OAuth/JWT libs early leads to rewrites. Choose `jose` + `oauth4webapi` to cover Node and Workers from the start.
- Version drift in MCP SDK: Pin a caret range and track notable breaking changes; create an SDK adapter layer if possible.

Mitigations embodied in Phase 1:
- ESM-only project, strict TS, minimal deps, interfaces-first for auth/storage/module loading, transport adapters.


## Concrete Phase 1 Checklist

- Initialize repository with ESM TypeScript, strict settings, and minimal toolchain.
- Create directory structure and stub files as per `master-mcp-definition.md`.
- Implement the `types` modules (`config.ts`, `auth.ts`, `server.ts`) exactly per spec.
- Add scaffolding for `index.ts` to create an MCP server instance and connect a stdio transport (no-op handlers yet).
- Add minimal validators and logger stubs to help later phases.
- Document platform constraints and dependency choices in README.


## Appendix: Suggested Files to Author in Phase 1

- tsconfig.json, package.json, README.md
- src/index.ts
- src/types/{config.ts,auth.ts,server.ts}
- src/server/{master-server.ts,protocol-handler.ts}
- src/modules/{module-loader.ts,capability-aggregator.ts,request-router.ts}
- src/auth/{multi-auth-manager.ts,oauth-providers.ts,token-manager.ts}
- src/utils/{logger.ts,crypto.ts,validators.ts}
- deploy placeholders (no runtime content yet)

These stubs allow Phases 2–5 to proceed without structural churn while keeping deployment options open across Workers, Koyeb, and Docker.

