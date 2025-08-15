# Master MCP Server — Phase 3 Analysis (Module Loading System)

This document researches and specifies the technical approach for Phase 3 (Module Loading System) of the Master MCP Server, aligned with `master-mcp-definition.md`. It focuses on dynamic server discovery/loading from multiple sources, multi-runtime process management (Node.js, Python, Docker), capability aggregation, health monitoring and failure recovery, and cross‑platform constraints (Node vs Cloudflare Workers).


## Phase 3 Scope Extract (from master-mcp-definition.md)

- Implement `ModuleLoader` for dynamic server discovery and loading
- Support multiple server types: `git`, `npm`, `pypi`, `docker`, `local`
- Implement `CapabilityAggregator` for tool/resource composition
- Handle server lifecycle (start, stop, restart, health checks)
- Support both local process spawning and remote endpoints
- Implement server type detection and runtime management

Implications: We need robust orchestration primitives, transport-agnostic capability discovery, portable runtime adapters, and strategies that scale across Node/Docker and Cloudflare Workers (remote-only).


## Design Summary

- Loader as orchestrator: A `ModuleLoader` coordinates fetching, installing, starting, health checking, and restarting servers from various sources into a uniform `LoadedServer` map.
- Transport abstraction: Interact with servers via a `TransportAdapter` interface (stdio, WebSocket, HTTP/SSE) so aggregation and routing code remain transport-agnostic.
- Supervisor pattern: Each server runs under a `ProcessSupervisor` (Node/Docker) with exponential backoff restarts, jitter, and bounded retries plus circuit breaker.
- Capability prefixing: `CapabilityAggregator` prefixes tool/resource identifiers with server IDs to avoid collisions and provides reverse mappings for routing.
- Cross-platform modes: Node/Koyeb/Docker run local processes; Workers runs a Remote-Only loader that connects to already-hosted endpoints.


## Dynamic Loading Sources and Strategies

Supported `ServerConfig.type` values: `git`, `npm`, `pypi`, `docker`, `local`.

### git

- Fetching:
  - Clone with shallow depth by default; support pinning to `branch`, `tag`, or commit SHA for reproducibility.
  - Cache by content-addressed key (e.g., `git:<url>@<ref>`) in a modules cache directory to avoid re-cloning.
- Detection:
  - After checkout, detect runtime by scanning for well-known manifests in the working tree.
  - Prefer explicit hints in config (e.g., `runtime: 'node' | 'python' | 'docker'`).
- Install:
  - Node: `npm ci` if `package-lock.json` exists; fallback `npm install --no-audit --fund=false`.
  - Python: create venv and `pip install -r requirements.txt` and/or `pip install .`; prefer hashes (`--require-hashes`) when lock exists.
  - Docker: build (if Dockerfile present and allowed) or use provided image reference; otherwise treat as local.
- Start:
  - Prefer stdio transport when supported by the server; otherwise HTTP/WS port (discover from config/env).

### npm

- Fetching:
  - Install package into an isolated directory (e.g., `.../modules/npm/<name>@<version>`).
  - Use `npm pack` + extract or `npm install <name>@<version> --no-save` into a sandboxed folder.
- Detection:
  - `package.json` signals Node runtime; look for `bin`, `exports`, or custom `mcp.server` field.
- Start:
  - Spawn the binary or `node` entry as stdio server, or run an npm script (e.g., `npm run mcp`), passing env/config.

### pypi

- Fetching/Install:
  - Create a venv per package version under cache and `pip install <name>==<version>` with optional `--require-hashes`.
- Detection:
  - `pyproject.toml`/`setup.cfg` indicates Python; look for entry points like `project.scripts` or a dedicated `mcp_server` entry point.
- Start:
  - Invoke installed console script within venv, prefer stdio.

### docker

- Fetching:
  - `docker pull <image>` with optional digest pin.
- Start:
  - `docker run` with a healthcheck if defined. Transport is typically HTTP/WS on an exposed port.
- Notes:
  - Requires Docker host; not available on Workers.

### local

- Use a local path already present on disk. Apply the same detection and start logic as `git` after checkout.


## Server Type Detection and Runtime Management

Goal: Decide how to start and communicate with a server. Prefer explicit hints; otherwise fall back to heuristics.

Detection order (per path or package root):
- Explicit config: `config.runtime` or `config.start.cmd` wins.
- Docker: presence of `Dockerfile` and/or explicit `docker.image`.
- Node: presence of `package.json` and either:
  - `mcp`: `{ "server": { "entry": "./dist/index.js", "transport": "stdio|ws|http" } }`
  - `bin` script likely to start an MCP server.
- Python: presence of `pyproject.toml` or `setup.cfg` + console script or module with main entry.
- Fallback: treat as HTTP endpoint if `config.endpoint` provided.

Runtime management:
- Node runtime: spawn via `node` or script binary; isolate via working dir and env; stdio preferred.
- Python runtime: spawn via venv `python -m <module>` or console script; stdio preferred.
- Docker runtime: start container, wait for readiness (health or port), then communicate over HTTP/WS.
- Remote runtime: skip spawning; create a `RemoteTransportAdapter` using configured endpoint.


## Multi-Runtime Process Management (Node, Python, Docker)

Key concerns: isolation, portability, graceful shutdown, backoff restarts, log capture, and health checks.

Recommended structure:
- `ProcessSupervisor` (Node/Docker): manages spawn, monitors exit, restarts with exponential backoff + jitter.
- `TransportAdapter` abstraction:
  - `StdioAdapter` for child processes.
  - `HttpAdapter` for HTTP/SSE.
  - `WsAdapter` for WebSocket.
  - `RemoteAdapter` wrapper for existing remote endpoints.

Example: process supervisor and spawn helpers (TypeScript/Node)

```ts
import { spawn, SpawnOptions } from 'node:child_process';

export interface StartResult { pid: number; stop: () => Promise<void>; }

export class ProcessSupervisor {
  private child?: import('node:child_process').ChildProcess;
  private restarts = 0;
  private stopping = false;

  constructor(private name: string, private startFn: () => Promise<StartResult>) {}

  async start() {
    await this.restart();
  }

  private async restart() {
    if (this.stopping) return;
    try {
      const res = await this.startFn();
      this.restarts = 0;
      // Attach exit listener
      this.child = (res as any).child ?? this.child;
    } catch (err) {
      await this.scheduleRetry(err as Error);
    }
  }

  private async scheduleRetry(err: Error) {
    const base = Math.min(30000, 1000 * 2 ** this.restarts);
    const jitter = Math.floor(Math.random() * 1000);
    const delay = base + jitter;
    this.restarts++;
    setTimeout(() => this.restart().catch(() => {}), delay);
  }

  async stop() {
    this.stopping = true;
    // Call underlying stop if exposed; also send SIGTERM and await.
  }
}

export async function spawnNodeServer(cmd: string, args: string[], opts: SpawnOptions): Promise<StartResult> {
  const child = spawn(cmd, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: opts.env,
    cwd: opts.cwd,
    shell: false,
  });
  child.stdout?.on('data', (d) => console.log(`[node] ${d}`));
  child.stderr?.on('data', (d) => console.error(`[node] ${d}`));

  return {
    pid: child.pid!,
    stop: async () => {
      child.kill('SIGTERM');
      await new Promise((r) => child.once('exit', r));
    },
  };
}
```

Python spawn example with venv activation:

```ts
import { spawn } from 'node:child_process';
import { join } from 'node:path';

function venvBin(venvPath: string, bin: string) {
  return process.platform === 'win32' ? join(venvPath, 'Scripts', `${bin}.exe`) : join(venvPath, 'bin', bin);
}

export async function spawnPythonServer(venvPath: string, entry: string, args: string[], cwd: string) {
  const python = venvBin(venvPath, 'python');
  const child = spawn(python, ['-m', entry, ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  // Attach logs and similar stop semantics as above
  return child;
}
```

Docker start sketch (HTTP transport):

```ts
// Pseudocode: requires Docker available
const args = [
  'run', '--rm', '--name', `mcp-${serverId}`,
  '-p', `${hostPort}:${containerPort}`,
  '--env', `MCP_MODE=http`,
  imageRef,
];
spawn('docker', args, { stdio: 'inherit' });
// Then poll http://localhost:hostPort/health or perform list_tools
```


## Capability Discovery and Aggregation

Principles:
- Discover via MCP methods (`list_tools`, `list_resources`, optionally prompts) through the active transport.
- Prefix all identifiers with `serverId:` to avoid collisions.
- Maintain mappings for reverse lookup and routing.

Transport-agnostic discovery example:

```ts
export interface TransportAdapter {
  request<T = any>(method: string, params?: any): Promise<T>;
  close(): Promise<void>;
}

export async function discoverCapabilities(t: TransportAdapter) {
  const tools = await t.request('list_tools');
  const resources = await t.request('list_resources').catch(() => ({ resources: [] }));
  return { tools, resources };
}
```

Aggregation with prefixing:

```ts
function prefixTools(serverId: string, tools: any[]) {
  return tools.map((t: any) => ({ ...t, name: `${serverId}:${t.name}` }));
}

function prefixResources(serverId: string, res: any[]) {
  return res.map((r: any) => ({ ...r, uri: `mcp://${serverId}/${r.uri.replace(/^mcp:\/\//, '')}` }));
}
```

Conflict resolution:
- First-wins policy by default, with warnings on collisions.
- Optional namespacing controls (allow opt-out of prefixing for trusted unique modules).

Updates:
- On server restart or `refreshServerCapabilities(serverId)`, re-discover and update maps atomically.


## Health Monitoring and Failure Recovery

Liveness and readiness:
- Process liveness: child process running (Node/Python) or container running (Docker).
- Readiness: a successful MCP call (`list_tools`) within a latency SLO.

Health check pattern:
- Periodic poll (e.g., every 30s) with a moving failure window (e.g., 3 consecutive failures → unhealthy).
- Backoff restarts with jitter after failures; cap max backoff and implement a circuit breaker to stop flapping.

Example health check (simplified):

```ts
async function performHealthCheck(server: LoadedServer, t: TransportAdapter) {
  const start = Date.now();
  try {
    await t.request('list_tools');
    const ms = Date.now() - start;
    return { ok: true, latencyMs: ms };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
```

Failure handling:
- Mark server `status: 'error'` after N failures; route is paused; retry according to policy.
- Escalate logs/metrics; maintain last error for diagnostics.
- Circuit breaker per server to avoid overwhelming restarts.


## Cross-Platform Considerations (Node vs Workers)

Node/Koyeb/Docker:
- Full access to filesystem and child processes; can spawn Node/Python servers and run Docker (when available).
- Prefer stdio transport for local processes to avoid port contention and simplify security.

Cloudflare Workers:
- Constraints: no child processes, no Docker, limited filesystem (read-only bundle), outbound HTTP only.
- Strategy: Remote-Only Module Loader:
  - Interpret `git`, `npm`, `pypi`, `docker`, `local` as metadata to resolve a remote endpoint rather than downloading/installing.
  - Require `endpoint` in `ServerConfig` or a registry mapping `id → endpoint`.
  - Use `fetch`/WebSocket/SSE transport adapters.
- Coordination/state:
  - Use Durable Objects to coordinate health checks, singleflight restarts (if applicable), and cache capabilities.
  - Use KV for cached capabilities with TTL as a fallback.
- Security:
  - No secrets in logs; bind secrets via Worker bindings.
  - Enforce strict CORS and origin policies if exposing HTTP.


## Repository Management and Dependency Handling

Working directories and caching:
- Cache root (Node):
  - Linux: `${XDG_CACHE_HOME:-~/.cache}/master-mcp/modules`
  - macOS: `~/Library/Caches/master-mcp/modules`
  - Windows: `%LOCALAPPDATA%\master-mcp\modules`
- Per-module folders keyed by stable IDs (`<type>/<slug>@<version-or-ref>`).
- Clean-up on eviction policy or explicit uninstall.

Git strategies:
- Shallow clone by default; deepen on demand.
- Pin to commit SHA for reproducibility; verify after checkout.
- Optional submodule init if required; discourage for simplicity.

Node strategies:
- Prefer `npm ci` with lockfile; set `--ignore-scripts` and allowlist needed lifecycle scripts if executing third-party code.
- Set `NODE_OPTIONS=--enable-source-maps` and strict env; avoid inheriting untrusted PATH.

Python strategies:
- Create isolated venv per module; do not share site-packages.
- Prefer `pip install --require-hashes -r requirements.txt` or pinned versions in `pyproject.lock`.
- Avoid `pip install -e` for untrusted sources.

Docker strategies:
- Use digest-pinned images; verify platform compatibility.
- Map only necessary ports; use seccomp/apparmor profiles if available.

Security hardening:
- Never execute postinstall scripts from untrusted sources unless explicitly allowed.
- Drop privileges when spawning (uid/gid) where supported.
- Limit environment propagation to a minimal allowlist from `ServerConfig.config.environment`.


## Example: ModuleLoader Interfaces and Flows

Sketch of core interfaces (aligned with `master-mcp-definition.md`):

```ts
export class ModuleLoader {
  private loadedServers = new Map<string, LoadedServer>();

  async loadServers(serverConfigs: ServerConfig[]): Promise<void> {
    for (const cfg of serverConfigs) {
      const s = await this.loadOne(cfg);
      this.loadedServers.set(cfg.id, s);
    }
  }

  private async loadOne(config: ServerConfig): Promise<LoadedServer> {
    switch (config.type) {
      case 'git': return this.loadFromGit(config);
      case 'npm': return this.loadFromNpm(config);
      case 'pypi': return this.loadFromPypi(config);
      case 'docker': return this.loadFromDocker(config);
      case 'local': return this.loadFromLocal(config);
    }
  }

  // ... loadFromGit/npm/pypi/docker/local → detect runtime → start (stdio/HTTP) → perform readiness check
}
```

Starting Node/Python via stdio and discovering capabilities:

```ts
const transport = new StdioAdapter(childProcess);
await waitUntilReady(transport, 10000);
const { tools, resources } = await discoverCapabilities(transport);
```


## Capability Aggregation Techniques

- Prefixing scheme: `tool: serverId:name`, `resource: mcp://serverId/<uri>`.
- Mapping tables: maintain `toolName → serverId`, `resourceUri → serverId`, and reverse lookups for de-prefixing in request routing.
- Schema validation: validate tool/resource shapes against MCP schemas; log and skip invalid entries.
- Incremental updates: re-merge only the changed server’s capabilities on refresh.

Example aggregator API (per spec):

```ts
export class CapabilityAggregator {
  private toolIndex = new Map<string, { serverId: string; original: string }>();
  private resourceIndex = new Map<string, { serverId: string; original: string }>();

  async discoverCapabilities(servers: Map<string, LoadedServer>) {
    for (const [serverId, s] of servers) {
      await this.discoverServerCapabilities(serverId, s);
    }
    // Merge not shown for brevity
  }
}
```


## Health Monitoring and Restart Patterns (Detailed)

- Heartbeat: perform `list_tools` as heartbeat; maintain `lastHealthCheck`, `status`, `latencyMs`.
- Backoff policy: exponential with cap and jitter; reset counter on success.
- Bounded retries: after M consecutive restarts in N minutes, open circuit for T minutes.
- Graceful shutdown: on master exit, send SIGTERM to all children and wait with timeout; stop health timers.


## Cross-Platform Deployment Considerations

- Configurability: expose per-server `transport` and `endpoint/port` overrides to support both stdio and HTTP transports.
- Logging: structured logs with `serverId`, `pid/containerId`, and correlation IDs.
- Metrics: basic metrics (start count, uptime, restart count, health latency) to inform autoscaling or debugging.
- Workers fallback: feature-flag a `REMOTE_ONLY=true` mode to disable any code paths that assume `child_process` or filesystem writes.


## Example Config Snippets

```jsonc
// git + node stdio
{
  "id": "notes-node",
  "type": "git",
  "url": "https://github.com/org/notes-mcp.git",
  "branch": "main",
  "auth_strategy": "bypass_auth",
  "config": { "environment": { "LOG_LEVEL": "info" } }
}

// pypi + python stdio
{
  "id": "search-py",
  "type": "pypi",
  "package": "mcp-search",
  "version": "1.4.2",
  "auth_strategy": "proxy_oauth",
  "config": {}
}

// docker + http endpoint
{
  "id": "vectorizer",
  "type": "docker",
  "package": "ghcr.io/org/vectorizer@sha256:...",
  "auth_strategy": "bypass_auth",
  "config": { "port": 8080 }
}

// remote endpoint for Workers
{
  "id": "files-remote",
  "type": "local",
  "auth_strategy": "master_oauth",
  "config": {},
  "endpoint": "https://mcp-files.example/api"
}
```


## Risks and Mitigations

- Untrusted code execution:
  - Mitigate via isolation (Docker preferred), venvs, minimal env, disable npm scripts by default.
- Port contention:
  - Prefer stdio; otherwise allocate ephemeral ports and detect conflicts with retry.
- Flapping servers:
  - Circuit breaker, restart backoff, and cap on retries per window.
- Workers limitations:
  - Enforce Remote-Only mode; document requirement that backends must be hosted elsewhere.


## References to Phase 3 Requirements

The strategies above directly support the Phase 3 items in `master-mcp-definition.md`:
- Dynamic loading: `loadFromGit/npm/pypi/docker/local` with detection and installation steps.
- Multi-runtime support: spawn Node/Python, orchestrate Docker, and remote endpoints.
- Capability aggregation: unified discovery via transport adapters and prefixing.
- Lifecycle: start/stop/restart with health checks and supervisor.
- Runtime detection: manifest heuristics and explicit overrides.
- Cross-platform: local processes on Node/Docker vs Remote-Only on Workers.


## Next Steps (Implementation Checklist)

- Implement `TransportAdapter` abstractions (stdio, http, ws) with a common `request` API.
- Implement `ModuleLoader` methods per spec with a `ProcessSupervisor` and health timer.
- Implement `CapabilityAggregator` prefixing and index maps with refresh logic.
- Add `REMOTE_ONLY` feature flag and a `RemoteModuleLoader` for Workers.
- Add configuration validation and safe defaults for env/args.

