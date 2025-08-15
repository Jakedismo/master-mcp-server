# Server Management

The `MasterServer` orchestrates backend servers and exposes convenience APIs.

## Key APIs

- `startFromConfig(config, clientToken?)`: Load and health-check backends, discover capabilities
- `performHealthChecks(clientToken?)`: Returns `{ [serverId]: boolean }`
- `restartServer(id)`: Restarts a backend (when supported)
- `unloadAll()`: Stops and clears all backends
- `getRouter()`: Access to `RequestRouter`
- `getAggregatedTools()/getAggregatedResources()`: Current aggregated definitions
- `attachAuthManager(multiAuth)`: Injects a `MultiAuthManager`
- `getOAuthFlowController()`: Provides an OAuth controller to mount in your runtime

## Node Runtime

`src/index.ts` creates an Express app exposing health, metrics, OAuth endpoints, and MCP HTTP endpoints. Use `npm run dev` during development.

## Workers Runtime

`src/runtime/worker.ts` exports a `fetch` handler integrating the protocol and OAuth flows. Configure via `deploy/cloudflare/wrangler.toml`.

