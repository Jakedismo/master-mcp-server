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

## Adding Backends by Source

> Note: Some origin types (git/npm/pypi/docker) are treated as config-driven endpoints in the current loader. Provide an explicit `url` or `port` for the running backend.

<CodeTabs :options="[
  { label: 'Local', value: 'local' },
  { label: 'Git', value: 'git' },
  { label: 'NPM', value: 'npm' },
  { label: 'Docker', value: 'docker' }
]">
  <template #local>

```yaml
servers:
  - id: search
    type: local
    auth_strategy: master_oauth
    config: { port: 4100 }
```

  </template>
  <template #git>

```yaml
servers:
  - id: tools-from-git
    type: git
    auth_strategy: bypass_auth
    config:
      url: http://git-tools.internal:4010
```

  </template>
  <template #npm>

```yaml
servers:
  - id: npm-tools
    type: npm
    auth_strategy: proxy_oauth
    config:
      url: http://npm-tools:4020
```

  </template>
  <template #docker>

```yaml
servers:
  - id: containerized
    type: docker
    auth_strategy: master_oauth
    config:
      url: http://containerized:4030
```

  </template>
</CodeTabs>

